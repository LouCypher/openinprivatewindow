/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - LouCypher (original code)
 */

(function() {

  const kAddonId = "OpenInPrivateWindow@loucypher";
  var gPrefService = Services.prefs.getBranch("extensions.OpenInPrivateWindow.");

  function getBoolPref(aPrefName) {
    return gPrefService.getBoolPref(aPrefName);
  }

  // Get 'Reuse Private Window' option
  function isPrivateWindowReuse() {
    return getBoolPref("reusePrivateWindow");
  }

  // Get 'Send original referrer' option
  function isReferrerSend() {
    return getBoolPref("sendReferrer");
  }

  // Check if window is Private Window
  function isWindowPrivate(aWindow) {
    return PrivateBrowsingUtils.isWindowPrivate(aWindow);
    // Return true if window is Private Window
  }

  // Check if a tab is blank tab
  function isBlankPageURL(aURL) {
    return aURL == "about:blank" ||
           aURL == "about:privatebrowsing" ||
           aURL == BROWSER_NEW_TAB_URL;
  }

  function $(aId) {
    return document.getElementById(aId);
  }

  function openNewOrSwitchToPrivateWindow() {
    if (isPrivateWindowReuse()) { // If 'Reuse Private Window' option is on
      if (isWindowPrivate(window)) { // If current window is Private Window
                                     // open a new tab
        gBrowser.selectedTab = gBrowser.addTab("about:privatebrowsing");
        return;
      }
      var index = 1;
      var em = Services.wm.getEnumerator("navigator:browser");
      while (em.hasMoreElements()) {
        let win = em.getNext();
        if (isWindowPrivate(win)) { // If win is Private Window
          win.focus();              // focus window
          return;
        }
      }
      index++;
    }
    // If 'Reuse Private Window' option is off
    OpenBrowserWindow({private: true}); // Open new Private Window
  }

  function openInPrivateWindow(aTarget) {
    var doc, url, places, placesNode;
    switch (aTarget) {
      case "frame": // The frame element you right click on
        doc = gContextMenu.target.ownerDocument; // document object of the frame
        url = doc.location.href; // URL of the frame
        break;
      case "link": // The link element you right click on
        doc = gContextMenu.target.ownerDocument; // document object of the link
        url = gContextMenu.linkURL; // link href
        break;
      case "page": // The page you right click on
        doc = gBrowser.contentDocument; // document object of the page
        url = gBrowser.currentURI.spec; // URL of the page
        break;
      case "bookmark": // Bookmark item you right click on
        places = true;
        placesNode = $("placesContext").triggerNode._placesNode;
        doc = null;
        url = placesNode.uri; // Bookmark URL
        break;
      case "history": // History item you right click on
        places = true;
        placesNode = $("historyContext").triggerNode._placesNode;
        doc = null;
        url = placesNode.uri; // History URL
    }

    doc && urlSecurityCheck(url, doc.nodePrincipal);

    var characterSet = places ? null : doc.characterSet;
    var referrerURI = places ? null
                             : isReferrerSend() ? doc.documentURIObject
                                                : null;
    var loadInBackground = getBoolPref("loadInBackground");

    if (isPrivateWindowReuse()) { // If 'Reuse Private Window' option is on
      var index = 1;
      var em = Services.wm.getEnumerator("navigator:browser");
      while (em.hasMoreElements()) {
        let win = em.getNext();
        if (isWindowPrivate(win)) { // If window is Private Window
          var browser = win.gBrowser; // Browser element of window
          if (isBlankPageURL(browser.currentURI.spec)) { // if blank tab on window
            win.loadURI(url, referrerURI);               // load URL in active tab
          } else { // load URL in new tab
            browser.loadOneTab(url, referrerURI, characterSet, null, false);
          }
          if (!loadInBackground) win.focus();
          return;
        }
      }
      index++;
    }

    // If 'Reuse Private Window' option is off, open URL in new Private Window
    openLinkIn(url, "window", { charset: characterSet,
                                referrerURI: referrerURI,
                                private: true });
  }

  // Open contribution page
  function contribute() {
    AddonManager.getAddonByID(kAddonId, function(aAddon) {
      var url = aAddon.contributionURL;
      if (!url) return;
      url = url.replace(/developers\?/, "contribute/installed?");
      var req = new XMLHttpRequest();
      req.open("GET", url, true);
      req.onreadystatechange = function (aEvent) {
        if ((req.readyState == 4) && (req.status == 200)) {
          gPrefService.setBoolPref("firstRun", false);
          switchToTabHavingURI(url, true);
        }
      }
      req.send(null);
    })
  }

  // Open options tab in Add-ons Manager
  function openPrivateWindowOptions() {
    BrowserOpenAddonsMgr("addons://detail/" + encodeURIComponent(kAddonId) +
                         "/preferences");
  }

  // Toggle show/hide menu icons
  function showMenuIcon(aId) {
    var menuitem = $(aId);
    var iconic = "menuitem-iconic";
    if (getBoolPref("showMenuIcons")) {
      menuitem.classList.add(iconic);
    } else {
      menuitem.classList.remove(iconic);
    }
  }

  // Check if a protocol can be opened in browser
  function isSchemeInternal(aSchemeURL) {
    var isSchemeInternal = false;
    var schemeHandler = Cc["@mozilla.org/uriloader/external-protocol-service;1"].
                        getService(Ci.nsIExternalProtocolService).
                        getProtocolHandlerInfo(aSchemeURL);
    isSchemeInternal = (!schemeHandler.alwaysAskBeforeHandling &&
                        schemeHandler.preferredAction == Ci.nsIHandlerInfo.useHelperApp &&
                        (schemeHandler.preferredApplicationHandler instanceof Ci.nsIWebHandlerApp));
    return isSchemeInternal;
  }

  // Check if link protocol is valid
  function isValidScheme(aURL) {
    var valid = /^(https?|file|data|chrome|about):/.test(aURL);
    if (/^(mailto|ircs?):/.test(aURL)) {
      valid = isSchemeInternal(aURL.match(/^[a-z-0-9]+/));
    }
    return valid;
  }

  // Initialize app menu
  function initAppmenu() {
    var showExitMenu = getBoolPref("showExitPrivateMenu");
    $("appmenu-closePrivate").hidden = !(isWindowPrivate(window) &&
                                         showExitMenu);
    $("appmenu-quit").hidden = !$("appmenu-closePrivate").hidden;
    $("appmenu_PrivateWindow").hidden = !isPrivateWindowReuse() ||
                                        isWindowPrivate(window);
    $("appmenu_newPrivateWindow").hidden = isPrivateWindowReuse() ||
                                           isWindowPrivate(window);
  }

  // Initialize File menu
  function initFileMenu() {
    var showExitMenu = getBoolPref("showExitPrivateMenu");
    $("filemenu-closePrivate").hidden = !(isWindowPrivate(window) && showExitMenu);
    $("menu_FileQuitItem").hidden = !$("filemenu-closePrivate").hidden;
    $("filemenu_PrivateWindow").hidden = !isPrivateWindowReuse() ||
                                         isWindowPrivate(window);
    $("menu_newPrivateWindow").hidden = isPrivateWindowReuse() ||
                                        isWindowPrivate(window);
  }

  // Initialize Bookmarks context menu
  function initPlacesMenu(aEvent) {
    var node = aEvent.target.triggerNode;
    var isPlacesNode = "_placesNode" in node;
    var placesNode = node._placesNode;
    var isNotBookmarkItem = isPlacesNode && placesNode.type > 0;
    ["openplacesprivatenew", "openplacesprivate"].forEach(function(aId) {
      var id = "placesContext-" + aId;
      showMenuIcon(id);
      $(id).hidden = (!isPlacesNode || isNotBookmarkItem) ||
                     !isValidScheme(placesNode.uri) ||
                     !getBoolPref("showOpenPlaces") ||
                     (isWindowPrivate(window) && isPrivateWindowReuse()) ||
                     (/new$/.test(id) ? isPrivateWindowReuse()
                                      : !isPrivateWindowReuse());
    })
  }

  // Initialize History context menu
  function initHistoryMenu(aEvent) {
    var node = aEvent.target.triggerNode;
    var isHistoryItem = "_placesNode" in node;
    var placesNode = node._placesNode;
    ["openplacesprivatenew", "openplacesprivate"].forEach(function(aId) {
      var id = "historyContext-" + aId;
      showMenuIcon(id);
      $(id).hidden = !isHistoryItem || !getBoolPref("showOpenPlaces") ||
                     (isHistoryItem && !isValidScheme(placesNode.uri)) ||
                     (isWindowPrivate(window) && isPrivateWindowReuse()) ||
                     (/new$/.test(id) ? isPrivateWindowReuse()
                                      : !isPrivateWindowReuse());
    })
  }

  // Initialize main context menu
  function initContextMenu(aEvent) {
    var GX = gContextMenu;

    var reuseWindow = isPrivateWindowReuse();
    var onPrivateWindow = isWindowPrivate(window);
    var contextOpenLink = $("context-openlinkprivate");
    contextOpenLink.removeAttribute("oncommand");
    contextOpenLink.setAttribute("command", "OpenPrivateWindow:link");

    GX.showItem("context-openlinkprivate",
                getBoolPref("showOpenLink") && !reuseWindow && 
                (isValidScheme(GX.linkURL) || GX.onPlainTextLink));

    GX.showItem("context-openlinkprivate2",
                getBoolPref("showOpenLink") && !onPrivateWindow && reuseWindow &&
                (isValidScheme(GX.linkURL) || GX.onPlainTextLink));

    GX.showItem("context-openpageprivatenew",
                getBoolPref("showOpenPage") && !reuseWindow &&
                !(GX.onTextInput || GX.onLink || GX.isContentSelected ||
                  GX.onImage || GX.onCanvas || GX.onVideo || GX.onAudio));

    GX.showItem("context-openpageprivate",
                getBoolPref("showOpenPage") && !onPrivateWindow && reuseWindow &&
                !(GX.onTextInput || GX.onLink || GX.isContentSelected ||
                  GX.onImage || GX.onCanvas || GX.onVideo || GX.onAudio));

    GX.showItem("context-openframeprivatenew",
                getBoolPref("showOpenFrame") && !reuseWindow);

    GX.showItem("context-openframeprivate",
                getBoolPref("showOpenFrame") && !onPrivateWindow && reuseWindow);

    GX.showItem("context-closeprivatewindow",
                getBoolPref("showExitPrivateContextMenu") && onPrivateWindow &&
                !(GX.onTextInput || GX.onLink || GX.isContentSelected ||
                  GX.onImage || GX.onCanvas || GX.onVideo || GX.onAudio));

    $("context-closeprivatewindow-separator").
    hidden = $("context-closeprivatewindow").hidden;

    ["context-openlinkprivate", "context-openlinkprivate2",
     "context-openpageprivatenew", "context-openpageprivate",
     "context-openframeprivatenew", "context-openframeprivate",
     "context-closeprivatewindow"].forEach(showMenuIcon);
  }

  function onLoad() {
    var appMenu = $("appmenu-popup");
    if (appMenu) { // Windows only
      appMenu.addEventListener("popupshowing", initAppmenu);
      appMenu.removeEventListener("popuphiding", initAppmenu);

      var appMenuHistory = $("appmenu_historyMenupopup");
      if (!appMenuHistory.hasAttribute("context")) {
        appMenuHistory.setAttribute("context", "historyContext");
      }
    }

    var historyMenu = $("goPopup");
    if (!historyMenu.hasAttribute("context")) {
      historyMenu.setAttribute("context", "historyContext");
    }

    var historyContext = $("historyContext");
    historyContext.addEventListener("popupshowing", initHistoryMenu);
    historyContext.removeEventListener("popuphiding", initHistoryMenu);

    var fileMenu = $("menu_FilePopup");
    fileMenu.addEventListener("popupshowing", initFileMenu);
    fileMenu.removeEventListener("popuphiding", initFileMenu);

    $("OpenPrivateWindow:switchto").
    openNewOrSwitchToPrivateWindow = openNewOrSwitchToPrivateWindow.bind();

    $("OpenPrivateWindow:options").
    openPrivateWindowOptions = openPrivateWindowOptions.bind();

    ["page", "link", "frame", "bookmark", "history"].forEach(function(aId) {
      $("OpenPrivateWindow:" + aId).
      openInPrivateWindow = openInPrivateWindow.bind();
    })

    // Move Open Frame... menuitems into Frame menu in context menu
    var separator = document.querySelector("#context-openframe + menuseparator");
    ["openframeprivatenew", "openframeprivate"].forEach(function(aId) {
      var menuitem = $("context-" + aId);
      separator.parentNode.insertBefore(menuitem, separator);
    })

    var contextmenu = $("contentAreaContextMenu");
    contextmenu.addEventListener("popupshowing", initContextMenu);
    contextmenu.removeEventListener("popuphiding", initContextMenu);

    var placesMenu = $("placesContext");
    placesMenu.addEventListener("popupshowing", initPlacesMenu);
    placesMenu.removeEventListener("popuphiding", initPlacesMenu);

    // Load contribution page on startup at first running
    getBoolPref("firstRun") && navigator.onLine
                            && !isWindowPrivate(window) && contribute();
  }

  window.addEventListener("load", onLoad);
  window.removeEventListener("unload", onLoad);

})()
