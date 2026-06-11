package com.worldcup;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.ReactRootView;

import android.os.Bundle; // needed for onCreate method
import android.view.KeyEvent;
import android.view.WindowManager;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.modules.i18nmanager.I18nUtil;


public class MainActivity extends ReactActivity {
@Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
    I18nUtil sharedI18nUtilInstance = I18nUtil.getInstance();
    sharedI18nUtilInstance.allowRTL(getApplicationContext(), false);
    sharedI18nUtilInstance.forceRTL(getApplicationContext(), false);
}

  @Override
  public void onBackPressed() {
    ReactInstanceManager manager = getReactNativeHost().getReactInstanceManager();
    if (manager != null) {
      manager.onBackPressed();
    }
    // Never call super.onBackPressed() — back is delegated to WebView.
    // App exits only when WebView sends an explicit "exit" message.
  }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    if (isBackKey(keyCode)) {
      onBackPressed();
      return true;
    }
    return super.onKeyDown(keyCode, event);
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getAction() == KeyEvent.ACTION_DOWN) {
      int keyCode = event.getKeyCode();
      if (isBackKey(keyCode)) {
        onBackPressed();
        return true;
      }
      if (isEnterKey(keyCode)) {
        emitKeyEventToReactNative(keyCode);
      }
    }
    return super.dispatchKeyEvent(event);
  }

  private void emitKeyEventToReactNative(int keyCode) {
    ReactInstanceManager manager = getReactNativeHost().getReactInstanceManager();
    if (manager == null) {
      return;
    }
    ReactContext context = manager.getCurrentReactContext();
    if (context == null) {
      return;
    }
    context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("worldcupKeyEvent", keyCode);
  }

  private boolean isEnterKey(int keyCode) {
    return keyCode == KeyEvent.KEYCODE_DPAD_CENTER
        || keyCode == KeyEvent.KEYCODE_ENTER
        || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER;
  }

  private boolean isBackKey(int keyCode) {
    return keyCode == KeyEvent.KEYCODE_BACK
        || keyCode == KeyEvent.KEYCODE_ESCAPE
        || keyCode == KeyEvent.KEYCODE_BUTTON_B
        || keyCode == 27
        || keyCode == 10009
        || keyCode == 461;
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "worldcup";
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. There the RootView is created and
   * you can specify the renderer you wish to use - the new renderer (Fabric) or the old renderer
   * (Paper).
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new MainActivityDelegate(this, getMainComponentName());
  }

  public static class MainActivityDelegate extends ReactActivityDelegate {
    public MainActivityDelegate(ReactActivity activity, String mainComponentName) {
      super(activity, mainComponentName);
    }

    @Override
    protected ReactRootView createRootView() {
      ReactRootView reactRootView = new ReactRootView(getContext());
      // If you opted-in for the New Architecture, we enable the Fabric Renderer.
      reactRootView.setIsFabric(BuildConfig.IS_NEW_ARCHITECTURE_ENABLED);
      return reactRootView;
    }

    @Override
    protected boolean isConcurrentRootEnabled() {
      // If you opted-in for the New Architecture, we enable Concurrent Root (i.e. React 18).
      // More on this on https://reactjs.org/blog/2022/03/29/react-v18.html
      return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
    }

 }
}
