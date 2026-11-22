package com.afu.volunteerportal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

// Implements ModifiedMainActivityForSocialLoginPlugin: the Google sign-in plugin
// (@capgo/capacitor-social-login) refuses login({ scopes }) unless the activity
// declares it forwards Google's authorization results (see onActivityResult).
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    // After Google sign-in, the plugin asks Google to authorize the email/profile
    // scopes. If Google needs the user to confirm, it opens a consent screen and
    // returns the answer here. The plugin doesn't register these request codes
    // with Capacitor, so without this the result is dropped and login() never
    // finishes. Hand it to the plugin, as its Android setup requires.
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN || requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            return;
        }
        PluginHandle handle = getBridge().getPlugin("SocialLogin");
        if (handle == null) return;
        Plugin plugin = handle.getInstance();
        if (plugin instanceof SocialLoginPlugin) {
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    // Marker required by ModifiedMainActivityForSocialLoginPlugin; intentionally empty.
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    // Android 8+ shows a notification only if it belongs to a channel. The
    // manifest tells Firebase to use this one by default for every push the
    // backend (Code.gs sendPush_) sends. IMPORTANCE_HIGH = heads-up banner,
    // like iOS. Creating an existing channel again is a no-op.
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            getString(R.string.default_notification_channel_id),
            getString(R.string.default_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.default_notification_channel_description));
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}
