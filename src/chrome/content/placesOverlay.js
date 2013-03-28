/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - LouCypher (original code)
 */

(function() {

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

  function openPlacesInPrivateWindow(aEvent) {
    var node = aEvent.explicitOriginalTarget.parentNode.triggerNode;
    var url = PlacesUIUtils.getViewForNode(node).selectedNode.uri;
    var loadInBackground = getBoolPref("loadInBackground");

    if (isPrivateWindowReuse()) { // If 'Reuse Private Window' option is on
      var index = 1;
      var em = Services.wm.getEnumerator("navigator:browser");
      while (em.hasMoreElements()) {
        let win = em.getNext();
        if (isWindowPrivate(win)) { // If window is Private Window
          var browser = win.gBrowser; // Browser element of window
          if (isBlankPageURL(browser.currentURI.spec)) { // if blank tab on window
            win.loadURI(url);               // load URL in active tab
          } else { // load URL in new tab
            browser.loadOneTab(url, null, null, null, false);
          }
          if (!loadInBackground) win.focus();
          return;
        }
      }
      index++;
    }
    // If 'Reuse Private Window' option is off, open URL in new Private Window
    openLinkIn(url, "window", { private: true });
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

  // Initialize places context menu
  function initPlacesMenu(aEvent) {
    var placesNode = PlacesUIUtils.getViewForNode(aEvent.target.triggerNode)
                                  .selectedNode;
    var isNotBookmarkItem = placesNode.type > 0;
    ["openplacesprivatenew", "openplacesprivate"].forEach(function(aId) {
      var id = "placesContext-" + aId;
      showMenuIcon(id);
      $(id).hidden = isNotBookmarkItem || !isValidScheme(placesNode.uri) ||
                     !getBoolPref("showOpenPlaces") ||
                     (isWindowPrivate(window) && isPrivateWindowReuse()) ||
                     (/new$/.test(id) ? isPrivateWindowReuse()
                                      : !isPrivateWindowReuse());
    })
  }

  function onLoad() {
    $("OpenPrivateWindow:places").
    openPlacesInPrivateWindow = openPlacesInPrivateWindow.bind();
    var placesMenu = $("placesContext");
    placesMenu.addEventListener("popupshowing", initPlacesMenu, false);
    placesMenu.removeEventListener("popuphiding", initPlacesMenu, false);
  }

  window.addEventListener("load", onLoad, false);
  window.removeEventListener("unload", onLoad, false);

})()