package org.libsdl.app;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * Watches audio output device changes (wired/BT headset hotplug) and kicks SDL2's static
 * AudioTrack so AudioFlinger re-attaches it to the new route. Without this, plugging a
 * headset mid-game leaves the pre-opened track stranded on the old device: permanent
 * silence until the game is relaunched.
 */
public final class AudioRouteWatcher {
    private static final String TAG = "SDLAudioRoute";
    private static final long KICK_DEBOUNCE_MS = 300L;

    private static AudioDeviceCallback sCallback;
    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static final Runnable sKickTask = () -> kickSdlAudioTrack();

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
        // but keep the debounce so bursts collapse into a single kick.
        if (!sinkChanged && devices != null && devices.length > 0) return;
        Log.i(TAG, (added ? "sink added" : "sink removed") + ", scheduling kick");
        sHandler.removeCallbacks(sKickTask);
        sHandler.postDelayed(sKickTask, KICK_DEBOUNCE_MS);
    }

    private static boolean isRelevantSink(AudioDeviceInfo info) {
        int type = info.getType();
        return info.isSink()
                && type != AudioDeviceInfo.TYPE_TELEPHONY
                && type != AudioDeviceInfo.TYPE_UNKNOWN;
    }

    /**
     * pause() -> flush() -> play() forces the framework to detach/reattach the track,
     * which reroutes it to the current output device. Mute toggle is the fallback for
     * vendor AudioTrack implementations that reject pause().
     */
    private static void kickSdlAudioTrack() {
        try {
            AudioTrack track = SDLAudioManager.mAudioTrack;
            if (track == null || track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) return;
            Log.i(TAG, "kicking AudioTrack for reroute");
            try {
                track.pause();
                track.flush();
                track.play();
            } catch (Throwable kickError) {
                Log.w(TAG, "pause/flush/play failed, falling back to mute toggle", kickError);
                track.setVolume(0.0f);
                track.setVolume(1.0f);
            }
        } catch (Throwable t) {
            Log.w(TAG, "kick failed", t);
        }
    }
}
