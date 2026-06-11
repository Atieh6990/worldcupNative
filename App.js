/**
 * @format
 * @flow strict-local
 */

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  memo,
} from "react";
import type { Node } from "react";
import {
  StyleSheet,
  View,
  BackHandler,
  Platform,
  Linking,
  Alert,
  Image,
  Text,
  PermissionsAndroid,
  I18nManager,
  Dimensions,
  DeviceEventEmitter,
} from "react-native";

import Video from "react-native-video";
import { WebView } from "react-native-webview";
import Spinner from "react-native-loading-spinner-overlay";
import DeviceInfo from "react-native-device-info";
import RNExitApp from "react-native-exit-app";

let webview = {};
let webviewLayoutInitialized = false;
let videoReadyUrl = "";

const normalizeVideoUrl = (url) => (url || "").trim().replace(/\/+$/, "");

const VideoPlayer = memo(
  ({
    playerUrl,
    posterUrl,
    showPoster,
    overlayMessage,
    webviewOnRight,
    rateVideo,
    onVideoReady,
  }) => {
    const player = useRef(null);
    const shouldPlayVideo = !!playerUrl;

    if (!playerUrl) {
      return null;
    }

    return (
      <View
        style={styles.videoLayerInner}
        collapsable={false}
        renderToHardwareTextureAndroid={true}
        pointerEvents="none"
      >
        {shouldPlayVideo ? (
          <Video
            paused={false}
            resizeMode="cover"
            source={{ uri: playerUrl }}
            ref={player}
            onReadyForDisplay={onVideoReady}
            rate={rateVideo}
            repeat={true}
            controls={false}
            playInBackground={true}
            playWhenInactive={true}
            ignoreSilentSwitch="ignore"
            useTextureView={true}
            pointerEvents="none"
            style={[
              styles.videoFullscreen,
              showPoster && styles.videoLoading,
            ]}
          />
        ) : null}
        {showPoster ? (
          <>
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                resizeMode="cover"
                pointerEvents="none"
                style={[styles.videoFullscreen, styles.posterOverlay]}
              />
            ) : (
              <View
                pointerEvents="none"
                style={[styles.videoFullscreen, styles.posterFallback]}
              />
            )}
            {overlayMessage ? (
              <View
                pointerEvents="none"
                style={[
                  styles.videoMessageAnchor,
                  webviewOnRight
                    ? { right: PANEL_WIDTH }
                    : { left: PANEL_WIDTH },
                ]}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  style={[
                    styles.videoMessageText,
                    webviewOnRight
                      ? styles.videoMessageTextRight
                      : styles.videoMessageTextLeft,
                    webviewOnRight
                      ? {
                          transform: [
                            {
                              translateX: VIDEO_MESSAGE_OFFSET_TOWARD_WEBVIEW,
                            },
                            { translateY: -VIDEO_MESSAGE_OFFSET_UP },
                          ],
                        }
                      : {
                          transform: [
                            {
                              translateX: -VIDEO_MESSAGE_OFFSET_TOWARD_WEBVIEW,
                            },
                            { translateY: -VIDEO_MESSAGE_OFFSET_UP },
                          ],
                        },
                  ]}
                >
                  {overlayMessage}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.playerUrl === next.playerUrl &&
    prev.posterUrl === next.posterUrl &&
    prev.showPoster === next.showPoster &&
    prev.overlayMessage === next.overlayMessage &&
    prev.webviewOnRight === next.webviewOnRight &&
    prev.rateVideo === next.rateVideo,
);

const PANEL_WIDTH = 350;
const VIDEO_MESSAGE_OFFSET_TOWARD_WEBVIEW = 140;
const VIDEO_MESSAGE_OFFSET_UP = 105;
const PANEL_IDLE_MS = 20000;
const PANEL_DEBUG = false;
const ENTER_KEY_CODES = {
  23: true,
  66: true,
  160: true,
};

const logPanel = (...args) => {
  if (PANEL_DEBUG) {
    console.log("[PanelIdle]", ...args);
  }
};
const screenSize = Dimensions.get("screen");
const windowSize = Dimensions.get("window");
const webviewSide = I18nManager.isRTL
  ? { left: 0, right: undefined }
  : { right: 0, left: undefined };
const webviewOnRight = !I18nManager.isRTL;

const App: () => Node = () => {
  const [spinner, setSpinner] = useState(true);
  const [deviceInfoReady, setDeviceInfoReady] = useState(false);
  const [macAddress, setMacAddress] = useState("");
  const [macLan, setMacLan] = useState("");
  const [videoShow, setVideoShow] = useState(false);
  const [playerUrl, setPlayerUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [videoOverlayMessage, setVideoOverlayMessage] = useState("");
  const [showPoster, setShowPoster] = useState(false);
  const playerUrlRef = useRef("");
  const videoShowRef = useRef(false);
  const isFullRef = useRef(false);
  const [rateVideo, setRateVideo] = useState(1.0);
  const [isFull, setIsFull] = useState(false);
  const [uid, setUid] = useState("");
  const [tvType, setTvType] = useState(1);
  const [panelVisible, setPanelVisible] = useState(true);
  const webviewRef = useRef(null);
  const panelVisibleRef = useRef(true);
  const webReadyRef = useRef(false);
  const panelIdleTimerRef = useRef(null);
  const resetPanelIdleRef = useRef(() => {});
  const inputFocusedRef = useRef(false);

  const clearPanelIdleTimer = useCallback(() => {
    if (panelIdleTimerRef.current) {
      clearTimeout(panelIdleTimerRef.current);
      panelIdleTimerRef.current = null;
    }
  }, []);

  const schedulePanelHide = useCallback(() => {
    if (inputFocusedRef.current) {
      logPanel("idle timer skipped - input focused");
      return;
    }
    clearPanelIdleTimer();
    logPanel("idle timer started", PANEL_IDLE_MS + "ms");
    panelIdleTimerRef.current = setTimeout(() => {
      panelIdleTimerRef.current = null;
      if (inputFocusedRef.current) {
        logPanel("idle timeout skipped - input focused");
        return;
      }
      logPanel("idle timeout -> hiding panel");
      setPanelVisible(false);
    }, PANEL_IDLE_MS);
  }, [clearPanelIdleTimer]);

  const setInputFocused = useCallback(
    (focused) => {
      inputFocusedRef.current = focused;
      if (focused) {
        clearPanelIdleTimer();
        logPanel("idle paused - input focused");
        return;
      }
      if (panelVisibleRef.current && webReadyRef.current) {
        schedulePanelHide();
      }
    },
    [clearPanelIdleTimer, schedulePanelHide]
    ,
  );

  const resetPanelIdle = useCallback((reason) => {
    if (
      !panelVisibleRef.current ||
      !webReadyRef.current ||
      inputFocusedRef.current
    ) {
      logPanel("idle reset skipped", reason, {
        visible: panelVisibleRef.current,
        webReady: webReadyRef.current,
      });
      return;
    }
    logPanel("idle reset", reason || "unknown");
    schedulePanelHide();
  }, [schedulePanelHide]);

  resetPanelIdleRef.current = resetPanelIdle;

  const focusWebViewPanel = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const ref = webviewRef.current || webview.ref;
    if (ref && typeof ref.requestFocus === "function") {
      ref.requestFocus();
    }
  }, []);

  const scheduleWebViewFocus = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }
    setTimeout(() => {
      focusWebViewPanel();
    }, 150);
  }, [focusWebViewPanel]);

  useEffect(() => {
    panelVisibleRef.current = panelVisible;
  }, [panelVisible]);

  useEffect(() => {
    if (panelVisible && webReadyRef.current) {
      schedulePanelHide();
      scheduleWebViewFocus();
    } else if (!panelVisible) {
      clearPanelIdleTimer();
    }
  }, [panelVisible, schedulePanelHide, clearPanelIdleTimer, scheduleWebViewFocus]);

  useEffect(() => {
    return () => {
      clearPanelIdleTimer();
    };
  }, [clearPanelIdleTimer]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const subscription = DeviceEventEmitter.addListener(
      "worldcupKeyEvent",
      (keyCode) => {
        if (!panelVisibleRef.current) {
          if (ENTER_KEY_CODES[keyCode]) {
            logPanel("Enter pressed -> showing panel");
            setPanelVisible(true);
          }
          return;
        }
        resetPanelIdleRef.current("native-key:" + keyCode);
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const ref = webviewRef.current || webview.ref;
    if (!ref || !webReadyRef.current) {
      return;
    }

    ref.injectJavaScript(
      "(function(){window.__nativePanelVisible=" +
        (panelVisible ? "true" : "false") +
        ";if(window.dispatchEvent){window.dispatchEvent(new CustomEvent('nativePanelVisibility',{detail:{visible:" +
        (panelVisible ? "true" : "false") +
        "}}));}if(" +
        (panelVisible ? "true" : "false") +
        "&&window.lockPanelViewport){window.lockPanelViewport();}return true;})();",
    );
  }, [panelVisible]);

  const dispatchBackToWebView = useCallback(() => {
    resetPanelIdleRef.current("native-back");
    const ref = webviewRef.current || webview.ref;
    if (ref) {
      ref.injectJavaScript(
        "(function(){if(window.handleNativeBack){window.handleNativeBack();}return true;})();",
      );
    }
    return true;
  }, []);

  useEffect(() => {
    Promise.all([
      DeviceInfo.getMacLanAddress().catch(() => ""),
      DeviceInfo.getMacAddress().catch(() => ""),
    ]).then(([lan, mac]) => {
      setMacLan(lan || "");
      setMacAddress(mac || "");
      setDeviceInfoReady(true);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "android") {
      const backSubscription = BackHandler.addEventListener(
        "hardwareBackPress",
        dispatchBackToWebView,
      );
      dealWithPermissions();

      const spinnerFallback = setTimeout(() => setSpinner(false), 25000);

      return () => {
        clearTimeout(spinnerFallback);
        backSubscription.remove();
      };
    }

    const spinnerFallback = setTimeout(() => setSpinner(false), 25000);
    return () => clearTimeout(spinnerFallback);
  }, [dispatchBackToWebView]);

  const sendDataInWebView = useCallback((type, data, calltype = "") => {
    const params = { type: type, data: data };
    const param = JSON.stringify(params);

    if (!webview.ref) {
      return;
    }

    if (calltype != "") {
      if (JSON.parse(calltype).fromOnlineJs == 1) {
        webview.ref.injectJavaScript("infoSsn.loginUserData(" + param + ")");
      }
      return;
    }

    webview.ref.injectJavaScript(
      "window.vm.$emit(\"PostMessages\", " + param + ")",
    );
  }, []);

  useEffect(() => {
    playerUrlRef.current = playerUrl;
  }, [playerUrl]);

  useEffect(() => {
    videoShowRef.current = videoShow;
  }, [videoShow]);

  useEffect(() => {
    isFullRef.current = isFull;
  }, [isFull]);

  const playVideo = useCallback((data) => {
    const nextUrl = normalizeVideoUrl(data && data.video);
    const nextPoster = data && data.poster ? data.poster : "";
    if (!nextUrl) {
      return;
    }

    const currentUrl = normalizeVideoUrl(playerUrlRef.current);
    if (
      videoShowRef.current &&
      currentUrl === nextUrl &&
      videoReadyUrl === nextUrl
    ) {
      return;
    }

    setPosterUrl(nextPoster);
    setVideoOverlayMessage(
      data && data.message ? String(data.message).trim() : "",
    );
    setShowPoster(true);
    setPlayerUrl(nextUrl);
    setVideoShow(true);
  }, []);

  const stopVideo = useCallback(() => {
    videoReadyUrl = "";
    setVideoShow(false);
    setPlayerUrl("");
    setPosterUrl("");
    setVideoOverlayMessage("");
    setShowPoster(false);
  }, []);

  const handleVideoReady = useCallback(() => {
    videoReadyUrl = normalizeVideoUrl(playerUrlRef.current);
    setShowPoster(false);
    setVideoOverlayMessage("");
  }, []);

  const loadAppData = () => {
    const sendData = {
      ver: DeviceInfo.getSystemVersion(),
      packageName: DeviceInfo.getBundleId(),
      model: DeviceInfo.getModel(),
      androidId: DeviceInfo.getUniqueId(),
    };
    const params = {
      type: "appData",
      data: JSON.stringify(sendData),
    };
    const param = JSON.stringify(params);
    webview.ref.injectJavaScript("infoSsn.appData(" + param + ")");
  };

  const dealWithPermissions = async () => {
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);
    } catch (err) {
      // ignore permission errors on TV
    }
  };

  const handlePress = async (url) => {
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(`Don't know how to open this URL: ${url}`);
    }
  };

  const markWebReady = useCallback(
    (source) => {
      if (webReadyRef.current) {
        return;
      }
      webReadyRef.current = true;
      logPanel("web ready", source);
      resetPanelIdleRef.current(source);
      scheduleWebViewFocus();
    },
    [scheduleWebViewFocus],
  );

  const handleOnMessage = useCallback(
    (event) => {
      let payload;
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch (error) {
        logPanel("invalid webview message", event.nativeEvent.data);
        return;
      }

      const { type, data } = payload;
      switch (type) {
        case "webReady":
          setSpinner(false);
          markWebReady("webReady-message");
          break;
        case "panelActivity":
          resetPanelIdleRef.current("panelActivity");
          break;
        case "panelInputFocus":
          setInputFocused(data === true || data === "true");
          break;
        case "browser":
          handlePress(data);
          break;
        case "getPkgName":
          loadAppData();
          break;
        case "playVideo":
          playVideo(data);
          break;
        case "stopVideo":
          stopVideo(data);
          break;
        case "rateVideo":
          setRateVideo(data);
          break;
        case "fullscreen":
          setIsFull(data == true);
          break;
        case "checkFullScreen":
          sendDataInWebView("checkFullScreen", isFullRef.current);
          break;
        case "exit":
          RNExitApp.exitApp();
          break;
      }
    },
    [playVideo, stopVideo, sendDataInWebView, markWebReady, setInputFocused],
  );

  const webViewSource = useMemo(() => {
    if (!deviceInfoReady) {
      return null;
    }

    return {
      uri:
        "file:///android_asset/index.html?webview=1&mac_lan=" +
        macLan +
        "&version=" +
        DeviceInfo.getSystemVersion() +
        "&mac=" +
        macAddress +
        "&uid=" +
        uid +
        "&tv_type=" +
        tvType +
        "&panel_w=" +
        PANEL_WIDTH +
        "&panel_h=" +
        windowSize.height +
        "&screen_w=" +
        screenSize.width +
        "&screen_h=" +
        screenSize.height,
      baseUrl: "file:///android_asset/",
    };
  }, [deviceInfoReady, macLan, macAddress, uid, tvType]);

  const videoPanel = useMemo(() => {
    if (!videoShow || !playerUrl) {
      return null;
    }

    return (
      <VideoPlayer
        playerUrl={playerUrl}
        posterUrl={posterUrl}
        showPoster={showPoster}
        overlayMessage={videoOverlayMessage}
        webviewOnRight={webviewOnRight}
        rateVideo={rateVideo}
        onVideoReady={handleVideoReady}
      />
    );
  }, [
    videoShow,
    playerUrl,
    posterUrl,
    showPoster,
    videoOverlayMessage,
    rateVideo,
    handleVideoReady,
  ]);

  const webviewPanel = useMemo(() => {
    if (!webViewSource) {
      return null;
    }

    return (
      <WebView
        onMessage={handleOnMessage}
        originWhitelist={["*"]}
        useWebKit={true}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        mediaPlaybackRequiresUserAction={false}
        style={styles.webview}
        source={webViewSource}
        ref={(ref) => {
          webview.ref = ref;
          webviewRef.current = ref;
        }}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        sharedCookiesEnabled={true}
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        androidLayerType="none"
        textZoom={100}
        setBuiltInZoomControls={false}
        scalesPageToFit={false}
        startInLoadingState={false}
        onNavigationStateChange={(navState) => {
          webview.canGoBack = navState.canGoBack;
        }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;

          if (webviewLayoutInitialized) {
            return;
          }

          if (height <= 0 || !webview.ref) {
            return;
          }

          webviewLayoutInitialized = true;
          webview.ref.injectJavaScript(
            "(function(){window.__nativePanelHeight=" +
              height +
              ";window.__nativePanelWidth=" +
              width +
              ";if(window.lockPanelViewport){window.lockPanelViewport();}return true;})();",
          );
        }}
        onLoadEnd={() => {
          setSpinner(false);
          if (webview.ref) {
            webview.ref.injectJavaScript(
              "(function(){if(window.lockPanelViewport){window.lockPanelViewport();}return true;})();",
            );
          }
          setTimeout(() => {
            if (!webReadyRef.current) {
              markWebReady("onLoadEnd-fallback");
            }
          }, 3000);
        }}
      />
    );
  }, [webViewSource, handleOnMessage, markWebReady]);

  return (
    <View style={styles.container}>
      <View style={styles.videoLayer} pointerEvents="none" collapsable={false}>
        {videoPanel}
      </View>
      {webviewPanel ? (
        <View
          style={[
            styles.webviewOverlay,
            webviewSide,
            !panelVisible && styles.webviewOverlayHidden,
          ]}
          pointerEvents={panelVisible ? "auto" : "none"}
          collapsable={false}
        >
          {webviewPanel}
        </View>
      ) : null}
      <Spinner
        visible={spinner}
        textContent={""}
        overlayColor="rgba(13, 13, 13, 0.95)"
        textStyle={{ color: "#ffffff" }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d0d",
    overflow: "hidden",
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },
  videoLayerInner: {
    ...StyleSheet.absoluteFillObject,
  },
  videoFullscreen: {
    ...StyleSheet.absoluteFillObject,
  },
  webviewOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    zIndex: 100,
    elevation: 100,
    direction: "ltr",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  webviewOverlayHidden: {
    opacity: 0,
    width: 0,
  },
  webview: {
    flex: 1,
    width: PANEL_WIDTH,
    backgroundColor: "transparent",
  },
  videoLoading: {
    opacity: 0,
  },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  posterFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0d0d0d",
  },
  videoMessageAnchor: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 2,
    elevation: 2,
  },
  videoMessageText: {
    color: "#ffffff",
    fontSize: 17,
    lineHeight: 26,
    writingDirection: "rtl",
    flexShrink: 0,
  },
  videoMessageTextRight: {
    textAlign: "right",
    alignSelf: "flex-end",
  },
  videoMessageTextLeft: {
    textAlign: "right",
    alignSelf: "flex-start",
  },
});
export default App;
