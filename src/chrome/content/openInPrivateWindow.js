/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - LouCypher (original code)
 */

(function(winObj) {

  var gPrefService = Services.prefs.getBranch("extensions.OpenInPrivateWindow.");

  function getBoolPref(aPrefName) {
    return gPrefService.getBoolPref(aPrefName);
  }

  function isWindowReuse() {
    return getBoolPref("reusePrivateWindow");
  }

  function isReferrerSend() {
    return getBoolPref("sendReferrer");
  }

  function isWindowPrivate(aWindow) {
    return PrivateBrowsingUtils.isWindowPrivate(aWindow);
  }

  function openInPrivateWindow(aTarget, aContextMenu) {
    var doc, url;
    switch (aTarget) {
      case "frame":
        doc = aContextMenu.target.ownerDocument;
        url = doc.location.href;
        break;
      case "link":
        doc = aContextMenu.target.ownerDocument;
        url = aContextMenu.linkURL;
        break;
      case "page":
        doc = gBrowser.contentDocument;
        url = gBrowser.currentURI.spec;
    }

    urlSecurityCheck(url, doc.nodePrincipal);

    var referrerURI = isReferrerSend() ? doc.documentURIObject : null;
    var loadInBackground = getBoolPref("loadInBackground");

    if (isWindowReuse()) {
      var index = 1;
      var em = Services.wm.getEnumerator("navigator:browser");
      while (em.hasMoreElements()) {
        let win = em.getNext();
        if (isWindowPrivate(win)) {
          var browser = win.gBrowser;
          if (isBlankPageURL(browser.currentURI.spec)) {
            win.loadURI(url, referrerURI);
          } else {
            browser.loadOneTab(url, referrerURI, doc.characterSet, null, false);
          }
          if (!loadInBackground) win.focus();
          return;
        }
      }
      index++;
    }

    openLinkIn(url, "window", { charset: doc.characterSet,
                                referrerURI: referrerURI,
                                private: true });
  }

  function showMenuIcon(aId) {
    var menuitem = document.getElementById(aId);
    if (getBoolPref("showMenuIcons")) {
      menuitem.className = "menuitem-iconic";
    } else {
      menuitem.classList.remove("menuitem-iconic");
    }
  }

  function initAppmenu() {
    var showExitMenu = getBoolPref("showExitPrivateMenu");
    var menuitem = document.getElementById("appmenu-closePrivate");
    var menuExit = document.getElementById("appmenu-quit");
    menuitem.hidden = !(isWindowPrivate(winObj) && showExitMenu);
    menuExit.hidden = !menuitem.hidden;
    showMenuIcon("appmenu-closePrivate");
  }

  function initFileMenu() {
    var showExitMenu = getBoolPref("showExitPrivateMenu");
    var menuitem = document.getElementById("filemenu-closePrivate");
    var menuExit = document.getElementById("menu_FileQuitItem");
    menuitem.hidden = !(isWindowPrivate(winObj) && showExitMenu);
    menuExit.hidden = !menuitem.hidden;
    showMenuIcon("filemenu-closePrivate");
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

    var reuseWindow = isWindowReuse();
    var onPrivateWindow = isWindowPrivate(winObj);
    var contextOpenLink = document.getElementById("context-openlinkprivate");
    contextOpenLink.removeAttribute("oncommand");
    contextOpenLink.setAttribute("command", "openPrivateWindow:link");

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

  function onLoad() {
    var appMenu = document.getElementById("appmenu-popup");
    if (appMenu) {
      appMenu.addEventListener("popupshowing", initAppmenu, false);
      appMenu.removeEventListener("popuphiding", initAppmenu, false);
    }

    var fileMenu = document.getElementById("menu_FilePopup");
    fileMenu.addEventListener("popupshowing", initFileMenu, false);
    fileMenu.removeEventListener("popuphiding", initFileMenu, false);

    ["page", "link", "frame"].forEach(function(aId) {
      document.getElementById("openPrivateWindow:" + aId)
              .openInPrivateWindow = openInPrivateWindow.bind();
    })

    var separator = document.querySelector("#context-openframe + menuseparator");
    ["openframeprivatenew", "openframeprivate"].forEach(function(aId) {
      var menuitem = document.getElementById("context-" + aId);
      separator.parentNode.insertBefore(menuitem, separator);
    })

    var contextmenu = document.getElementById("contentAreaContextMenu");
    contextmenu.addEventListener("popupshowing", initContextMenu, false);
    contextmenu.removeEventListener("popuphiding", initContextMenu, false);
  }

  winObj.addEventListener("load", onLoad, false);
  winObj.removeEventListener("unload", onLoad, false);

})(window)