var NodeHelper = require("node_helper");
var https = require("https");

module.exports = NodeHelper.create({
  start: function () {
    console.log("MMM-OASABus helper started");
    this.config = null;
    this.stopCode = null;
    this.stopName = null;
    this.routeMap = {};
    this.lineCodeToID = {};
    this.filteredLineCode = null;
  },

  socketNotificationReceived: function (notification, payload) {
    var self = this;
    if (notification === "OASA_INIT") {
      self.config = payload;
      self.setup();
    }
    if (notification === "OASA_REFRESH") {
      self.fetchArrivals();
    }
  },

  fetchJSON: function (url, callback) {
    var req = https.get(url, function (res) {
      var data = "";
      res.on("data", function (chunk) { data += chunk; });
      res.on("end", function () {
        try { callback(null, JSON.parse(data)); }
        catch (e) { callback(null, null); }
      });
    });
    req.setTimeout(10000, function () {
      req.destroy();
      callback("timeout", null);
    });
    req.on("error", function (e) {
      callback("Request error: " + e.message, null);
    });
  },

  setup: function () {
    var self = this;
    var cfg = self.config;
    console.log("MMM-OASABus setup: stopCode=" + cfg.stopCode + " routeType=" + cfg.routeType + " lineID=" + cfg.lineID);

    self.stopCode = cfg.stopCode;

    self.resolveStopName(function () {
      self.buildRouteMap(function () {
        self.fetchArrivals();
      });
    });
  },

  resolveStopName: function (callback) {
    var self = this;
    var cfg = self.config;

    if (cfg.stopDescrEng) {
      self.stopName = cfg.stopDescrEng;
      console.log("MMM-OASABus: stop name from config: " + self.stopName);
      return callback();
    }

    self.fetchJSON("https://telematics.oasa.gr/api/?act=getStopNameAndXY&p1=" + self.stopCode, function (err, result) {
      if (!err && result && result[0] && result[0].stop_descr_matrix_eng) {
        self.stopName = result[0].stop_descr_matrix_eng;
        console.log("MMM-OASABus: resolved stop name: " + self.stopName);
      } else {
        self.stopName = self.stopCode;
        console.log("MMM-OASABus: could not resolve stop name, using stopCode");
      }
      callback();
    });
  },

  buildRouteMap: function (callback) {
    var self = this;
    var cfg = self.config;

    self.fetchJSON("https://telematics.oasa.gr/api/?act=webRoutesForStop&p1=" + self.stopCode, function (err, routes) {
      if (err || !routes) {
        console.log("MMM-OASABus: failed to load routes for stop, will resolve lazily");
        return callback();
      }

      var routeList = Array.isArray(routes) ? routes : [routes];
      console.log("MMM-OASABus: loaded " + routeList.length + " routes for stop " + self.stopCode);

      for (var i = 0; i < routeList.length; i++) {
        var r = routeList[i];
        self.routeMap[r.RouteCode] = {
          lineID: r.LineID,
          routeDescrEng: r.RouteDescrEng,
          routeType: parseInt(r.RouteType)
        };
        console.log("MMM-OASABus: route " + r.RouteCode + " lineID=" + r.LineID + " type=" + r.RouteType + " -> " + r.RouteDescrEng);
      }

      callback();
    });
  },

  fetchArrivals: function () {
    var self = this;
    var cfg = self.config;

    self.fetchJSON("https://telematics.oasa.gr/api/?act=getStopArrivals&p1=" + self.stopCode, function (err, arrivals) {
      if (err) {
        console.log("MMM-OASABus: arrivals fetch failed (" + err + "), retrying on next interval");
        return self.sendSocketNotification("OASA_ARRIVALS_STALE", {});
      }

      if (!Array.isArray(arrivals) || arrivals.length === 0) {
        console.log("MMM-OASABus: no arrivals for stopCode=" + self.stopCode);
        return self.sendSocketNotification("OASA_ARRIVALS", { arrivals: [], stopName: self.stopName });
      }

      console.log("MMM-OASABus: got " + arrivals.length + " raw arrivals");

      var unknownCodes = [];
      for (var i = 0; i < arrivals.length; i++) {
        var rc = arrivals[i].route_code;
        if (!self.routeMap[rc] && unknownCodes.indexOf(rc) === -1) {
          unknownCodes.push(rc);
        }
      }

      self.resolveUnknownRouteCodes(unknownCodes, function () {
        var results = [];
        for (var i = 0; i < arrivals.length; i++) {
          var a = arrivals[i];
          var rc = a.route_code;
          var info = self.routeMap[rc];

          if (!info) {
            console.log("MMM-OASABus: could not resolve route_code " + rc + ", skipping");
            continue;
          }

          console.log("MMM-OASABus: arrival lineID=" + info.lineID + " routeType=" + info.routeType + " btime2=" + a.btime2);

          if (cfg.routeType && info.routeType !== parseInt(cfg.routeType)) {
            console.log("MMM-OASABus: skip " + rc + " routeType mismatch (" + info.routeType + " != " + cfg.routeType + ")");
            continue;
          }

          if (cfg.lineID && info.lineID !== cfg.lineID) {
            console.log("MMM-OASABus: skip " + rc + " lineID mismatch (" + info.lineID + " != " + cfg.lineID + ")");
            continue;
          }

          results.push({
            btime2: a.btime2,
            lineID: info.lineID,
            routeDescrEng: info.routeDescrEng
          });
        }

        results.sort(function (a, b) { return parseInt(a.btime2) - parseInt(b.btime2); });
        console.log("MMM-OASABus: sending " + results.length + " arrivals");

        self.sendSocketNotification("OASA_ARRIVALS", {
          arrivals: results,
          stopName: self.stopName
        });
      });
    });
  },

  resolveUnknownRouteCodes: function (routeCodes, callback) {
    var self = this;
    if (routeCodes.length === 0) return callback();

    console.log("MMM-OASABus: resolving unknown route_codes: " + routeCodes.join(", "));
    var pending = routeCodes.length;
    routeCodes.forEach(function (rc) {
      self.resolveRouteByScanning(rc, function () {
        pending--;
        if (pending === 0) callback();
      });
    });
  },

  resolveRouteByScanning: function (targetRc, callback) {
    var self = this;

    // First try webRoutesForStop refresh — fastest for this stop's routes
    self.fetchJSON("https://telematics.oasa.gr/api/?act=webRoutesForStop&p1=" + self.stopCode, function (err, routes) {
      if (!err && routes) {
        var routeList = Array.isArray(routes) ? routes : [routes];
        for (var i = 0; i < routeList.length; i++) {
          var r = routeList[i];
          if (!self.routeMap[r.RouteCode]) {
            self.routeMap[r.RouteCode] = {
              lineID: r.LineID,
              routeDescrEng: r.RouteDescrEng,
              routeType: parseInt(r.RouteType)
            };
          }
        }
        if (self.routeMap[targetRc]) {
          console.log("MMM-OASABus: resolved " + targetRc + " via webRoutesForStop refresh");
          return callback();
        }
      }

      // Fallback: scan all lines
      self.fetchJSON("https://telematics.oasa.gr/api/?act=webGetLines", function (err, lines) {
        if (err || !lines) {
          self.routeMap[targetRc] = { lineID: "?", routeDescrEng: "Route " + targetRc, routeType: -1 };
          return callback();
        }

        var lineCodes = lines.map(function (l) { return l.LineCode; });
        var idx = 0;
        var found = false;

        function tryNext() {
          if (found || idx >= lineCodes.length) {
            if (!found) {
              self.routeMap[targetRc] = { lineID: "?", routeDescrEng: "Route " + targetRc, routeType: -1 };
            }
            return callback();
          }
          var lc = lineCodes[idx++];
          self.fetchJSON("https://telematics.oasa.gr/api/?act=webGetRoutes&p1=" + lc, function (err, routes) {
            if (err || !routes) return tryNext();
            for (var i = 0; i < routes.length; i++) {
              var r = routes[i];
              if (!self.routeMap[r.RouteCode]) {
                self.routeMap[r.RouteCode] = {
                  lineID: r.LineID || "?",
                  routeDescrEng: r.RouteDescrEng,
                  routeType: parseInt(r.RouteType)
                };
              }
              if (r.RouteCode === targetRc) {
                found = true;
                console.log("MMM-OASABus: resolved " + targetRc + " via scan -> lineID=" + self.routeMap[targetRc].lineID);
              }
            }
            if (found) return callback();
            tryNext();
          });
        }
        tryNext();
      });
    });
  }
});
