/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
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
  PermissionsAndroid,
  I18nManager,
  Dimensions,
  DeviceEventEmitter,
} from "react-native";

import { Colors, Header } from "react-native/Libraries/NewAppScreen";
import Video from "react-native-video";
import { WebView } from "react-native-webview";
import Spinner from "react-native-loading-spinner-overlay";
// import SharedGroupPreferences from "react-native-shared-group-preferences";
import DeviceInfo from "react-native-device-info";
import RNExitApp from "react-native-exit-app";
import { getMacLanAddress } from "react-native-device-info/src/index";

let webview = {};
let webviewLayoutInitialized = false;
let videoReadyUrl = "";

const normalizeVideoUrl = (url) => (url || "").trim().replace(/\/+$/, "");

const VideoPlayer = memo(
  ({
    playerUrl,
    posterUrl,
    showPoster,
    rateVideo,
    onVideoReady,
  }) => {
    const player = useRef(null);

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
        {showPoster && posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            resizeMode="cover"
            pointerEvents="none"
            style={[styles.videoFullscreen, styles.posterOverlay]}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.playerUrl === next.playerUrl &&
    prev.posterUrl === next.posterUrl &&
    prev.showPoster === next.showPoster &&
    prev.rateVideo === next.rateVideo,
);

const PANEL_WIDTH = 350;
const PANEL_IDLE_MS = 5000;
const PANEL_DEBUG = true;
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
// RTL mirrors left/right — in RTL, left:0 = physical right edge
const webviewSide = I18nManager.isRTL
  ? { left: 0, right: undefined }
  : { right: 0, left: undefined };

const App: () => Node = () => {
  const [ref, setRef] = useState(true);
  const [spinner, setSpinner] = useState(true);
  const [deviceInfoReady, setDeviceInfoReady] = useState(false);
  const [userData, setUserData] = useState({});
  const [macAddress, setMacAddress] = useState("");
  const [macLan, setMacLan] = useState("");
  const [videoShow, setVideoShow] = useState(false);
  const [playerUrl, setPlayerUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
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

  const clearPanelIdleTimer = useCallback(() => {
    if (panelIdleTimerRef.current) {
      clearTimeout(panelIdleTimerRef.current);
      panelIdleTimerRef.current = null;
    }
  }, []);

  const schedulePanelHide = useCallback(() => {
    clearPanelIdleTimer();
    logPanel("idle timer started", PANEL_IDLE_MS + "ms");
    panelIdleTimerRef.current = setTimeout(() => {
      panelIdleTimerRef.current = null;
      logPanel("idle timeout -> hiding panel");
      setPanelVisible(false);
    }, PANEL_IDLE_MS);
  }, [clearPanelIdleTimer]);

  const resetPanelIdle = useCallback((reason) => {
    if (!panelVisibleRef.current || !webReadyRef.current) {
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

  useEffect(() => {
    panelVisibleRef.current = panelVisible;
  }, [panelVisible]);

  useEffect(() => {
    if (panelVisible && webReadyRef.current) {
      schedulePanelHide();
    } else if (!panelVisible) {
      clearPanelIdleTimer();
    }
  }, [panelVisible, schedulePanelHide, clearPanelIdleTimer]);

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
    // console.log('///////webviewRef = ',type,data,webview.ref);
    //alert('step3')

    let params = { type: type, data: data };
    const param = JSON.stringify(params);
    // console.log("param", param);

    if (webview.ref) {
      if (calltype != "") {
        if (JSON.parse(calltype).fromOnlineJs == 1) {
          webview.ref.injectJavaScript("infoSsn.loginUserData(" + param + ")");
          return false;
        }

      } else {
        webview.ref.injectJavaScript("window.vm.$emit(\"PostMessages\", " + param + ")");
      }
    }
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
    if (videoShowRef.current && currentUrl === nextUrl && videoReadyUrl === nextUrl) {
      return;
    }

    setPosterUrl(nextPoster);
    setShowPoster(!!nextPoster);
    setPlayerUrl(nextUrl);
    setVideoShow(true);
  }, []);

  const stopVideo = useCallback(() => {
    videoReadyUrl = "";
    setVideoShow(false);
    setPlayerUrl("");
    setPosterUrl("");
    setShowPoster(false);
  }, []);

  const handleVideoReady = useCallback(() => {
    videoReadyUrl = normalizeVideoUrl(playerUrlRef.current);
    setShowPoster(false);
  }, []);

  const loadAppData = () => {

    let sendData = {
      ver: DeviceInfo.getSystemVersion(),
      packageName: DeviceInfo.getBundleId(),
      model: DeviceInfo.getModel(),
      androidId: DeviceInfo.getUniqueId(),
    };
    let params = {
      type: "appData", data: JSON.stringify(sendData),
    };
    const param = JSON.stringify(params);
    webview.ref.injectJavaScript("infoSsn.appData(" + param + ")");
  };

  const loadUserDataFromSharedStorage = async (data) => {
    try {
      // alert('******webview', webview.ref);
      const loadedData = await SharedGroupPreferences.getItem(
        "savedData",
        appGroupIdentifier,
      );
      // alert("step2" + loadedData);

      sendDataInWebView("userData", loadedData, data);
      //alert(JSON.stringify(loadedData));
    } catch (errorCode) {

      // alert('errorCode'+errorCode)
      sendDataInWebView("userData", "null", data);
    }
  };

  const saveUserDataToSharedStorage = async (data) => {
    try {
      const grantedStatus = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);
      const writeGranted =
        grantedStatus["android.permission.WRITE_EXTERNAL_STORAGE"] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const readGranted =
        grantedStatus["android.permission.READ_EXTERNAL_STORAGE"] ===
        PermissionsAndroid.RESULTS.GRANTED;
      if (writeGranted && readGranted) {
        await SharedGroupPreferences.setItem(
          "savedData",
          data,
          appGroupIdentifier,
        );

        sendDataInWebView("setTokenSuccess", "{}");
      } else {
        sendDataInWebView("setTokenError", "{}");
      }
    } catch (errorCode) {
      //sendDataInWebView('setTokenError',{errorCode});
      //console.log(errorCode)
    }
  };

  const dealWithPermissions = async () => {
    try {
      const grantedStatus = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);
      const writeGranted =
        grantedStatus["android.permission.WRITE_EXTERNAL_STORAGE"] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const readGranted =
        grantedStatus["android.permission.READ_EXTERNAL_STORAGE"] ===
        PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      //console.warn(err)
    }
  };

  const handlePress = async (url) => {
    // Checking if the link is supported for links with custom URL scheme.
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      // Opening the link with some app, if the URL scheme is "http" the web link should be opened
      // by some browser in the mobile
      await Linking.openURL(url);
    } else {
      Alert.alert(`Don't know how to open this URL: ${url}`);
    }
  };

  const markWebReady = useCallback((source) => {
    if (webReadyRef.current) {
      return;
    }
    webReadyRef.current = true;
    logPanel("web ready", source);
    resetPanelIdleRef.current(source);
  }, []);

  const handleOnMessage = useCallback((event) => {
    let payload;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch (error) {
      logPanel("invalid webview message", event.nativeEvent.data);
      return;
    }

    const { type, data } = payload;
    // alert('ver-->' + DeviceInfo.getSystemVersion() + 'packageName-->' + DeviceInfo.getBundleId() + 'model-->' + DeviceInfo.getModel() + 'androidId-->' + DeviceInfo.getUniqueId())
    // {ver:DeviceInfo.getSystemVersion(),packageName:DeviceInfo.getBundleId(),model:DeviceInfo.getModel(),androidId:DeviceInfo.getUniqueId()};
    // console.log('han
    // dleOnMessage type ===>  ' , JSON.parse(event.nativeEvent.data));
    // console.log('handleOnMessage data ===>  ' , data , type);
    switch (type) {
      case "webReady":
        setSpinner(false);
        markWebReady("webReady-message");
        break;
      case "panelActivity":
        resetPanelIdleRef.current("panelActivity");
        break;
      case "browser":
        handlePress(data);
        break;
      case "setToken":
        // saveUserDataToSharedStorage(data);
        break;
      case "getToken":
        // loadUserDataFromSharedStorage(data);
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
  }, [playVideo, stopVideo, sendDataInWebView, markWebReady]);

  const webViewSource = useMemo(() => {
    if (!deviceInfoReady) {
      return null;
    }

    return {
      uri:
        "file:///android_asset/index.html?webview=1&mac_lan=" +
        macLan +
        "&version=" + DeviceInfo.getSystemVersion() +
        "&mac=" + macAddress +
        "&uid=" + uid +
        "&tv_type=" + tvType +
        "&panel_w=" + PANEL_WIDTH +
        "&panel_h=" + windowSize.height +
        "&screen_w=" + screenSize.width +
        "&screen_h=" + screenSize.height,
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
        rateVideo={rateVideo}
        onVideoReady={handleVideoReady}
      />
    );
  }, [videoShow, playerUrl, posterUrl, showPoster, rateVideo, handleVideoReady]);

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
            if (webviewLayoutInitialized) {
              return;
            }

            const { width, height } = event.nativeEvent.layout;
            if (width <= 0 || height <= 0 || !webview.ref) {
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
  Pdirection: {
    position: "absolute",
    width: "82%",
    height: "100%",
    left: 0, top: 0,
  },
  EDirection: { left: 0 },
});
export default App;
