// https://github.com/bbecquet/Leaflet.PolylineDecorator/blob/master/src/L.RotatedMarker.js

const RotatedMarker = L.Marker.extend({
    options: {
        angle: 0
    },

    statics: {
        TRANSFORM_ORIGIN: L.DomUtil.testProp(
            ['transformOrigin', 'WebkitTransformOrigin', 'OTransformOrigin', 'MozTransformOrigin', 'msTransformOrigin'])
    },

    _initIcon: function() {
        L.Marker.prototype._initIcon.call(this);

        this._icon.style[L.RotatedMarker.TRANSFORM_ORIGIN] = this._getTransformOrigin();
    },

    _getTransformOrigin: function() {
        var iconAnchor = this.options.icon.options.iconAnchor;

        if (!iconAnchor) {
            return '50% 50%';
        }

        return iconAnchor[0] + 'px ' + iconAnchor[1] + 'px';
    },

    _setPos: function(pos) {
        L.Marker.prototype._setPos.call(this, pos);

        if (L.DomUtil.TRANSFORM) {
            // use the CSS transform rule if available
            this._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
        } else if (L.Browser.ie) {
            // fallback for IE6, IE7, IE8
            var rad = this.options.angle * (Math.PI / 180),
                costheta = Math.cos(rad),
                sintheta = Math.sin(rad);
            this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
                costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
        }
    },

    setAngle: function(ang) {
        this.options.angle = ang;
    }
});

const rotatedMarker = function(pos, options) {
    return new L.RotatedMarker(pos, options);
};

function pick(obj, keys) {
    return Object.keys(obj).filter(function(k) {
        return !!(keys.indexOf(k) + 1)
    }).reduce(function(prev, curr) {
        var o = {}
        o[curr] = obj[curr]
        return L.extend(prev, o)
    }, {})
}

window.nsGmx = window.nsGmx || {}

window.nsGmx.ClusterLayer = L.Class.extend({
    // options.dataLayer
    // options.dataLayerId
    // + MarkerClusterGroup options
    initialize: function(options) {
        L.setOptions(this, options)
        this._markerClusterGroup = L.markerClusterGroup(pick(this.options, [
            'showCoverageOnHover',
            'zoomToBoundsOnClick',
            'spiderfyOnMaxZoom',
            'removeOutsideVisibleBounds',
            'animate',
            'animateAddingMarkers',
            'disableClusteringAtZoom',
            'maxClusterRadius',
            'polygonOptions',
            'singleMarkerMode',
            'spiderLegPolylineOptions',
            'spiderfyDistanceMultiplier',
            'iconCreateFunction',
            'maxZoom'
        ]))
    },

    _updateBbox: function() {
        this._styleManager.gmx.currentZoom = this._map.getZoom()
        var screenBounds = this._map.getBounds(),
            p1 = screenBounds.getNorthWest(),
            p2 = screenBounds.getSouthEast(),
            bbox = L.gmxUtil.bounds([
                [p1.lng, p1.lat],
                [p2.lng, p2.lat]
            ])
        this._observer && this._observer.setBounds(bbox)
    },

    onAdd: function(map) {
        this._map = map

        this._getDataLayer().then((dataLayer) => {
            this._dataLayer = dataLayer
            this._styleManager = this._dataLayer._gmx.styleManager
            return this._styleManager.initStyles()
        }).then(() => {
            map.on('moveend', this._updateBbox, this)
            this._updateBbox()
            this._bindDataProvider()
        }).catch((err) => {
            console.error(err)
        })

        map.addLayer(this._markerClusterGroup)
        this._bindPopupEvents()
    },

    onRemove: function(map) {
        this._getDataLayer().then((dl) => {
            this._unbindDataProvider()
            map.removeLayer(this._markerClusterGroup)
            map.off('moveend', this._updateBbox, this)
        })
    },

    setDateInterval: function(dateBegin, dateEnd) {
        this._dateInterval = [dateBegin, dateEnd]
        this._observer && this._observer.setDateInterval.apply(this._observer, this._dateInterval)
    },

    createPopup: function ({ parsedProperties: propertiesHash, item: { id, propertiesArr }, layer: dataLayer }) {
        const balloonData = dataLayer._gmx.styleManager.getItemBalloon(id)

        if (balloonData && !balloonData.DisableBalloonOnClick) {
            var style = dataLayer.getItemStyle(id)
            if (style && style.iconAnchor) {
                var protoOffset = L.Popup.prototype.options.offset
                this._popup.options.offset = [-protoOffset[0] - style.iconAnchor[0] + style.sx / 2,
                    protoOffset[1] - style.iconAnchor[1] + style.sy / 2
                ]
            }

            return L.popup()
                .setContent(L.gmxUtil.parseBalloonTemplate(balloonData.templateBalloon, {
                    properties: propertiesHash,
                    tileAttributeTypes: dataLayer._gmx.tileAttributeTypes,
                    unitOptions: this._map.options || {},
                    geometries: [propertiesArr[properties.length - 1]]
                }))
        }
    },

    _getDataLayer: function () {
        if (!this._pGetDataLayer) {
            this._pGetDataLayer = new Promise((resolve, reject) => {
                if (this.options.dataLayer) {
                    return resolve(this.options.dataLayer)
                } else if (this.options.dataLayerRef) {
                    const arRes = this.options.dataLayerRef.split(':')
                    if (arRes.length !== 2) {
                        return reject('invalid dataLayerRef')
                    }
                    return L.gmx.loadLayer(arRes[0], arRes[1]).then(resolve, reject)
                }
                return reject('dataLayer is not specified')
            })
        }

        return this._pGetDataLayer
    },

    _bindDataProvider: function() {
        this._observer = this._dataLayer.addObserver({
            type: 'resend',
            filters: ['styleFilter'],
            dateInterval: this._dateInterval,
            callback: this._onObserverData.bind(this)
        })
    },

    _unbindDataProvider: function() {
        this._dataLayer.removeObserver(this._observer)
        this._observer = null
    },

    _onObserverData: function(data) {
        const { dataLayer } = this.options

        // this._vectorTileItemsProperties = {}
        const markers = data.added.map(({ id, properties, item: { parsedStyleKeys } }) => {
            // this._vectorTileItemsProperties[id] = dataLayer.getItemProperties(properties)
            const itemGeoJson = properties[properties.length - 1]
            if (itemGeoJson.type !== 'POINT') {
                return
            }

            const itemStyle = parsedStyleKeys || dataLayer.getItemStyle(id)

            const latlng = L.Projection.Mercator.unproject({
                x: itemGeoJson.coordinates[0],
                y: itemGeoJson.coordinates[1]
            })

            if (itemStyle.iconUrl) {
                return createIconMarker(latlng, itemStyle, { id })
            } else {
                return L.marker(latlng, { id })
            }
        }).filter(item => !!item)

        this._markerClusterGroup.clearLayers()
        this._markerClusterGroup.addLayers(markers)

        function createIconMarker(latlng, itemStyle, options) {
            if (itemStyle.rotate) {
                return rotatedMarker(latlng, L.extend({}, {
                    icon: createIconMarkerIcon(itemStyle),
                    angle: itemStyle.rotate
                }, options))
            } else {
                return L.marker(latlng, L.extend({}, {
                    icon: createIconMarkerIcon(itemStyle)
                }, options))
            }
        }

        function createIconMarkerIcon(itemStyle) {
            if (itemStyle && itemStyle.iconUrl) {
                var iconAnchor = itemStyle.image ? [itemStyle.sx / 2, itemStyle.sy / 2] : [8, 10]
                return L.icon({
                    iconAnchor: iconAnchor,
                    iconUrl: itemStyle.iconUrl
                })
            } else {
                return L.gmxUtil.getSVGIcon(itemStyle)
            }
        }
    },

    _popupOnClustersMarkerClick: function ({ layer: marker, latlng, originalEvent }) {
        const item = this._dataLayer._gmx.dataManager.getItem(marker.options.id)
        const layer = this._dataLayer
        const parsedProperties = layer.getItemProperties(item.properties)

        const popup = this.createPopup({ parsedProperties, item, layer, originalEvent })
        if (!popup) {
            return
        }

        this._popup = popup
        this._popup
            .setLatLng(latlng)
            .openOn(this._map)
    },

    _popupOnClustersAnimationEnd: function (ev) {
        const map = this._popup && this._popup._map
        map && map.removeLayer(this._popup)
    },

    _bindPopupEvents: function () {
        const mcg = this._markerClusterGroup
        mcg.on('click', this._popupOnClustersMarkerClick, this)
        mcg.on('animationend', this._popupOnClustersAnimationEnd, this)
    }
})
