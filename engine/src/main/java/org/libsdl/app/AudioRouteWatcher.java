package org.libsdl.app;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * Watches audio output device changes (wired/BT headset hotplug) and REBUILDS SDL2's static
 * AudioTrack on the new route. A mere pause/flush/play kick is not enough on many OEM ROMs:
 * once the pre-opened track is invalidated by a route change it never recovers and stays
 * silent until the game is relaunched. Instead we create a fresh track (which lands on the
 * current default device), atomically swap the static reference, then release the old one —
 * the native writer thread re-reads the field on every call, so playback continues seamlessly.
 */
public final class AudioRouteWatcher {
    private static final String TAG = "SDLAudioRoute";
    private static final long REBUILD_DEBOUNCE_MS = 300L;

    private static AudioDeviceCallback sCallback;
    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static final Runnable sRebuildTask = () -> rebuildSdlAudioTrack();

    private AudioRouteWatcher() {
    }

    /**
     * Idempotent; safe to call from any thread once a Context is available.
     * Uses the application context so the static callback never pins an Activity
     * (AudioManager keeps a reference to the Context it was created from).
     */
    public static synchronized void ensureRegistered() {
        if (sCallback != null) return;
        try {
            Context context = SDL.getContext();
            if (context == null) context = SDLActivity.getContext();
            if (context != null) {
                ensureRegistered(context);
            }
        } catch (Throwable t) {
            Log.w(TAG, "register failed", t);
        }
    }

    /** Explicit-context variant for engines whose host is not an SDLActivity (e.g. Kirikiroid/Cocos2dx). */
    public static synchronized void ensureRegistered(Context rawContext) {
        if (sCallback != null) return;
        try {
            Context context = rawContext != null ? rawContext.getApplicationContext() : null;
            if (context == null) return;
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            sCallback = new AudioDeviceCallback() {
                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                    onRouteChanged(addedDevices, true);
                }

                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                    onRouteChanged(removedDevices, false);
                }
            };
            am.registerAudioDeviceCallback(sCallback, sHandler);
            Log.i(TAG, "registered");
        } catch (Throwable t) {
            Log.w(TAG, "register failed", t);
        }
    }

    private static void onRouteChanged(AudioDeviceInfo[] devices, boolean added) {
        boolean sinkChanged = false;
        if (devices != null) {
            for (AudioDeviceInfo info : devices) {
                if (isRelevantSink(info)) {
                    sinkChanged = true;
                    break;
                }
            }
        }
        // Some OEMs report empty arrays on route change; treat every callback as relevant
        // but keep the debounce so bursts collapse into a single rebuild.
        if (!sinkChanged && devices != null && devices.length > 0) return;
        Log.i(TAG, (added ? "sink added" : "sink removed") + ", scheduling rebuild");
        sHandler.removeCallbacks(sRebuildTask);
        sHandler.postDelayed(sRebuildTask, REBUILD_DEBOUNCE_MS);
    }

    private static boolean isRelevantSink(AudioDeviceInfo info) {
        int type = info.getType();
        return info.isSink()
                && type != AudioDeviceInfo.TYPE_TELEPHONY
                && type != AudioDeviceInfo.TYPE_UNKNOWN;
    }

    /**
     * Creates a replacement AudioTrack bound to the CURRENT output device, swaps the static
     * reference, then releases the stale one. Paused tracks are rebuilt paused so background
     * pause/mute handling (e.g. Kirikiroid's onPause silencing) keeps working afterwards.
     */
    private static void rebuildSdlAudioTrack() {
        try {
            AudioTrack old = SDLAudioManager.mAudioTrack;
            if (old == null || old.getState() != AudioTrack.STATE_INITIALIZED) return;
            boolean wasPlaying = old.getPlayState() == AudioTrack.PLAYSTATE_PLAYING;

            int sampleRate = old.getSampleRate();
            int channelCount = old.getChannelCount();
            int channelConfig = channelCount >= 6 ? AudioFormat.CHANNEL_OUT_5POINT1
                    : channelCount >= 4 ? AudioFormat.CHANNEL_OUT_QUAD
                    : channelCount == 2 ? AudioFormat.CHANNEL_OUT_STEREO
                    : AudioFormat.CHANNEL_OUT_MONO;
            // getEncoding() requires API 29; below that the SDL2 Java shim only negotiates 16-bit PCM.
            int encoding = Build.VERSION.SDK_INT >= 29
                    ? old.getFormat().getEncoding()
                    : AudioFormat.ENCODING_PCM_16BIT;
            int bufferBytes = Math.max(old.getBufferSizeInFrames(), 256)
                    * channelCount * bytesPerSample(encoding);

            AudioTrack next = new AudioTrack(AudioManager.STREAM_MUSIC, sampleRate, channelConfig,
                    encoding, bufferBytes, AudioTrack.MODE_STREAM);
            if (next.getState() != AudioTrack.STATE_INITIALIZED) {
                Log.w(TAG, "rebuild aborted: replacement track init failed");
                next.release();
                return;
            }
            if (wasPlaying) next.play();
            SDLAudioManager.mAudioTrack = next;
            try {
                old.pause();
            } catch (Throwable ignored) {
            }
            try {
                old.release();
            } catch (Throwable ignored) {
            }
            Log.i(TAG, "rebuilt AudioTrack rate=" + sampleRate + " ch=" + channelCount
                    + " enc=" + encoding + " playing=" + wasPlaying);
        } catch (Throwable t) {
            Log.w(TAG, "rebuild failed", t);
        }
    }

    private static int bytesPerSample(int encoding) {
        if (encoding == AudioFormat.ENCODING_PCM_FLOAT) return 4;
        if (encoding == AudioFormat.ENCODING_PCM_8BIT) return 1;
        return 2;
    }
}
