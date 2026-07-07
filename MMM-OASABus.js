Module.register("MMM-OASABus", {
  defaults: {
    lineID: "",                // optional — leave empty to show all lines at the stop
    routeType: "",             // 1 = inbound, 2 = outbound, leave empty for all directions
    stopCode: "",              // required — StopCode from OASA API
    stopDescrEng: "",          // optional — display label only (skips API name lookup if set)
    displayMode: "full",       // "full" = show route description | "compact" = line + time only
    updateInterval: 30000      // refresh interval in milliseconds
  },

  requiresVersion: "2.1.0",

  start: function () {
    Log.info("MMM-OASABus: Starting module");
    this.arrivals = [];
    this.stopName = this.config.stopDescrEng || "";
    this.error = null;
    this.loaded = false;

    this.sendSocketNotification("OASA_INIT", {
      lineID: this.config.lineID || null,
      routeType: this.config.routeType || null,
      stopCode: this.config.stopCode,
      stopDescrEng: this.config.stopDescrEng
    });
  },

  // Use native MM header — return the configured header string
  getHeader: function () {
    return this.data.header || "OASA TELEMATICS";
  },

  socketNotificationReceived: function (notification, payload) {
    var self = this;
    if (notification === "OASA_ARRIVALS") {
      self.arrivals = payload.arrivals;
      self.stopName = payload.stopName || self.config.stopDescrEng;
      self.error = null;
      self.loaded = true;
      self.updateDom(300);

      clearTimeout(self._refreshTimer);
      self._refreshTimer = setTimeout(function () {
        self.sendSocketNotification("OASA_REFRESH", {});
      }, self.config.updateInterval);
    }

    if (notification === "OASA_ARRIVALS_STALE") {
      // API temporarily unreachable — keep current display, schedule retry
      clearTimeout(self._refreshTimer);
      self._refreshTimer = setTimeout(function () {
        self.sendSocketNotification("OASA_REFRESH", {});
      }, self.config.updateInterval);
    }

    if (notification === "OASA_ERROR") {
      self.error = payload.message;
      self.loaded = true;
      self.updateDom(300);
    }
  },

  // Returns true if lineID belongs to a trolleybus (Athens trolleybus lines are 1–16)
  isTrolleybus: function (lineID) {
    var n = parseInt(lineID, 10);
    return !isNaN(n) && String(n) === String(lineID).trim() && n >= 1 && n <= 16;
  },

  getDom: function () {
    var wrapper = document.createElement("div");
    wrapper.className = "oasa-bus-wrapper";

    if (this.config.displayMode === "compact") {
      wrapper.classList.add("oasa-compact");
    }

    if (!this.loaded) {
      var loading = document.createElement("div");
      loading.className = "oasa-loading";
      loading.innerHTML = "Loading...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (this.error) {
      var errEl = document.createElement("div");
      errEl.className = "oasa-error";
      errEl.innerHTML = "&#9888; " + this.error;
      wrapper.appendChild(errEl);
      return wrapper;
    }

    // Stop name
    var stopEl = document.createElement("div");
    stopEl.className = "oasa-stop";
    stopEl.innerHTML = "Stop: <span class='oasa-stop-name'>" + this.stopName + "</span>";
    wrapper.appendChild(stopEl);

    // Divider
    var divider = document.createElement("div");
    divider.className = "oasa-divider";
    wrapper.appendChild(divider);

    // "Next Arrivals" header
    var headerEl = document.createElement("div");
    headerEl.className = "oasa-arrivals-header";
    headerEl.innerHTML = "Next Arrivals";
    wrapper.appendChild(headerEl);

    if (!this.arrivals || this.arrivals.length === 0) {
      var noData = document.createElement("div");
      noData.className = "oasa-no-arrivals";
      noData.innerHTML = "No upcoming arrivals";
      wrapper.appendChild(noData);
      return wrapper;
    }

    var list = document.createElement("div");
    list.className = "oasa-arrivals-list";

    for (var i = 0; i < this.arrivals.length; i++) {
      var a = this.arrivals[i];
      var row = document.createElement("div");
      row.className = "oasa-arrival-row";

      // Line badge — amber for trolleybus, blue for bus
      var lineSpan = document.createElement("span");
      lineSpan.className = "oasa-line-id";
      if (this.isTrolleybus(a.lineID)) {
        lineSpan.classList.add("oasa-trolley");
      }
      lineSpan.innerHTML = a.lineID || "?";

      // Route description (hidden in compact mode via CSS)
      var routeSpan = document.createElement("span");
      routeSpan.className = "oasa-route-descr";
      routeSpan.innerHTML = a.routeDescrEng || "";

      // Arrival time
      var timeSpan = document.createElement("span");
      timeSpan.className = "oasa-btime";
      timeSpan.innerHTML = "in <strong>" + a.btime2 + "'</strong>";

      row.appendChild(lineSpan);
      row.appendChild(routeSpan);
      row.appendChild(timeSpan);
      list.appendChild(row);
    }

    wrapper.appendChild(list);
    return wrapper;
  },

  getStyles: function () {
    return ["MMM-OASABus.css"];
  }
});
