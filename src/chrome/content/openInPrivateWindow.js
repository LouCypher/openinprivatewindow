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

  function isBlankPageURL(aURL) {
    return aURL == "about:blank" || "about:privatebrowsing"
                                 || aURL == BROWSER_NEW_TAB_URL;
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
      case "places": // Bookmark item you right click on
        places = true;
        placesNode = $("placesContext").triggerNode._placesNode;
        doc = null;
        url = placesNode.uri; // Bookmark URL
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

  function showMenuIcon(aId) {
    var menuitem = $(aId);
    var iconic = "menuitem-iconic";
    if (getBoolPref("showMenuIcons")) {
      menuitem.classList.add(iconic);
    } else {
      menuitem.classList.remove(iconic);
    }
  }

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

  function openPrivateWindowOptions() {
    BrowserOpenAddonsMgr("addons://detail/" + encodeURIComponent(kAddonId) +
                         "/preferences");
  }

  function initAppmenu() {
    var showExitMenu = getBoolPref("showExitPrivateMenu");
    $("appmenu-closePrivate").hidden = !(isWindowPrivate(window) &&
                                         showExitMenu);
    $("appmenu-quit").hidden = !$("appmenu-closePrivate").hidden;
    $("appmenu_PrivateWindow").hidden = !isPrivateWindowReuse() ||
                                        isWindowPrivate(window);
    $("appmenu_newPrivateWindow").hidden = true;
  }

  function initFileMenu() {
    var showExitMenu = getBoolPref("showExitPrivateMenu");
    $("filemenu-closePrivate").hidden = !(isWindowPrivate(window) && showExitMenu);
    $("menu_FileQuitItem").hidden = !$("filemenu-closePrivate").hidden;
    $("appmenu_PrivateWindow").hidden = !isPrivateWindowReuse() ||
                                        isWindowPrivate(window);
    $("appmenu_newPrivateWindow").hidden = isPrivateWindowReuse() &&
                                           !isWindowPrivate(window);
    $("filemenu_PrivateWindow").hidden = !isPrivateWindowReuse() ||
                                         isWindowPrivate(window);
    $("menu_newPrivateWindow").hidden = isPrivateWindowReuse() &&
                                        !isWindowPrivate(window);
  }

  function initContextMenu(aEvent) {
    var GX = gContextMenu;

    var isMailtoInternal = false;
    if (GX.onMailtoLink) {
      var mailtoHandler = Cc["@mozilla.org/uriloader/external-protocol-service;1"].
                          getService(Ci.nsIExternalProtocolService).
                          getProtocolHandlerInfo("mailto");
      isMailtoInternal = (!mailtoHandler.alwaysAskBeforeHandling &&
                          mailtoHandler.preferredAction == Ci.nsIHandlerInfo.useHelperApp &&
                          (mailtoHandler.preferredApplicationHandler instanceof Ci.nsIWebHandlerApp));
    }

    var reuseWindow = isPrivateWindowReuse();
    var onPrivateWindow = isWindowPrivate(window);
    var contextOpenLink = $("context-openlinkprivate");
    contextOpenLink.removeAttribute("oncommand");
    contextOpenLink.setAttribute("command", "OpenPrivateWindow:link");

    GX.showItem("context-openlinkprivate",
                getBoolPref("showOpenLink") && !reuseWindow && 
                (GX.onSaveableLink || isMailtoInternal || GX.onPlainTextLink));

    GX.showItem("context-openlinkprivate2",
                getBoolPref("showOpenLink") && !onPrivateWindow && reuseWindow &&
                (GX.onSaveableLink || isMailtoInternal || GX.onPlainTextLink));

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
                getBoolPref("showExitPrivateContextMenu") && onPrivateWindow);

    GX.showItem("context-closeprivatewindow-separator",
                getBoolPref("showExitPrivateContextMenu") && onPrivateWindow);

    ["context-openlinkprivate", "context-openlinkprivate2",
     "context-openpageprivatenew", "context-openpageprivate",
     "context-openframeprivatenew", "context-openframeprivate",
     "context-closeprivatewindow"].forEach(showMenuIcon);
  }

  function initPlacesMenu(aEvent) {
    var placesNode = aEvent.target.triggerNode._placesNode;
    var isNotBookmarkItem = placesNode.type > 0;
    ["openplacesprivatenew", "openplacesprivate"].forEach(function(aId) {
      var id = "placesContext-" + aId;
      showMenuIcon(id);
      $(id).hidden = isNotBookmarkItem || !getBoolPref("showOpenPlaces") ||
                     (/new$/.test(id) ? isPrivateWindowReuse()
                                      : !isPrivateWindowReuse());
    })
  }

  function onLoad() {
    var appMenu = $("appmenu-popup");
    if (appMenu) {
      appMenu.addEventListener("popupshowing", initAppmenu, false);
      appMenu.removeEventListener("popuphiding", initAppmenu, false);
    }

    var fileMenu = $("menu_FilePopup");
    fileMenu.addEventListener("popupshowing", initFileMenu, false);
    fileMenu.removeEventListener("popuphiding", initFileMenu, false);

    $("OpenPrivateWindow:switchto").
    openNewOrSwitchToPrivateWindow = openNewOrSwitchToPrivateWindow.bind();

    $("OpenPrivateWindow:options").
    openPrivateWindowOptions = openPrivateWindowOptions.bind();

    ["page", "link", "frame", "places"].forEach(function(aId) {
      $("OpenPrivateWindow:" + aId).
      openInPrivateWindow = openInPrivateWindow.bind();
    })

    var separator = document.querySelector("#context-openframe + menuseparator");
    ["openframeprivatenew", "openframeprivate"].forEach(function(aId) {
      var menuitem = $("context-" + aId);
      separator.parentNode.insertBefore(menuitem, separator);
    })

    var contextmenu = $("contentAreaContextMenu");
    contextmenu.addEventListener("popupshowing", initContextMenu, false);
    contextmenu.removeEventListener("popuphiding", initContextMenu, false);

    var placesMenu = $("placesContext");
    placesMenu.addEventListener("popupshowing", initPlacesMenu, false);
    placesMenu.removeEventListener("popuphiding", initPlacesMenu, false);

    getBoolPref("firstRun") && navigator.onLine
                            && !isWindowPrivate(window) && contribute();
  }

  window.addEventListener("load", onLoad, false);
  window.removeEventListener("unload", onLoad, false);

})()