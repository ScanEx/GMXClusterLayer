function pick(obj, keys) {
    return Object.keys(obj).filter(function(k) {
        return !!(keys.indexOf(k) + 1)
    }).reduce(function(prev, curr) {
        var o = {}
        o[curr] = obj[curr]
        return L.extend(prev, o)
    }, {})
}

window.ClusterLayer = L.Class.extend({
    // options.dataLayer
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
            'iconCreateFunction'
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
        this._styleManager = this.options.dataLayer._gmx.styleManager
        this._styleManager.initStyles().then(() => {
            map.on('moveend', this._updateBbox, this)
            this._updateBbox()
            this._bindDataProvider()
        })

        map.addLayer(this._markerClusterGroup)
        this._bindDefaultPopup()
    },

    onRemove: function(map) {
        this._unbindDataProvider()
        map.removeLayer(this._markerClusterGroup)
        map.off('moveend', this._updateBbox, this)
    },

    setDateInterval: function(dateBegin, dateEnd) {
        this._dateInterval = [dateBegin, dateEnd]
        this._observer && this._observer.setDateInterval.apply(this._observer, this._dateInterval)
    },

    _bindDataProvider: function() {
        this._observer = this.options.dataLayer.addObserver({
            type: 'resend',
            filters: ['styleFilter'],
            dateInterval: this._dateInterval,
            callback: this._onObserverData.bind(this)
        })
    },

    _unbindDataProvider: function() {
        this.options.dataLayer.removeObserver(this._observer)
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

    _defaultPopupOnClustersMarkerClick: function ({ layer, latlng }) {
        const { dataLayer } = this.options
        const item = dataLayer._gmx.dataManager.getItem(layer.options.id)

        // if (currentSpiderfiedCluster && !(currentSpiderfiedCluster.getAllChildMarkers().indexOf(ev.layer) + 1)) {
        //     currentSpiderfiedCluster.unspiderfy();
        //     markers.once('unspiderfied', function () {
        //         this._openPopup(propsArr, ev.latlng);
        //     }, this);
        // } else {
        this._openPopup(item, latlng);
        // }
    },

    _defaultPopupOnClustersClusterClick: function (ev) {

    },

    _defaultPopupOnClustersAnimationEnd: function (ev) {

    },

    _defaultPopupOnClustersSpiderfied: function (ev) {

    },

    _defaultPopupOnClustersUnspiderfied: function (ev) {

    },

    _bindDefaultPopup: function () {
        const mcg = this._markerClusterGroup
        mcg.on('click', this._defaultPopupOnClustersMarkerClick, this)
    },

    _unbindDefaultPopup: function () {

    },

    _openPopup: function ({ id, properties }, latlng) {
        const { dataLayer } = this.options
        const propertiesHash = dataLayer.getItemProperties(properties)
        const balloonData = dataLayer._gmx.styleManager.getItemBalloon(id)

        if (balloonData && !balloonData.DisableBalloonOnClick) {
            var style = dataLayer.getItemStyle(id)
            if (style && style.iconAnchor) {
                var protoOffset = L.Popup.prototype.options.offset
                this._popup.options.offset = [-protoOffset[0] - style.iconAnchor[0] + style.sx / 2,
                    protoOffset[1] - style.iconAnchor[1] + style.sy / 2
                ]
            }

            L.popup()
                .setLatLng(latlng)
                .setContent(L.gmxUtil.parseBalloonTemplate(balloonData.templateBalloon, {
                    properties: propertiesHash,
                    tileAttributeTypes: dataLayer._gmx.tileAttributeTypes,
                    unitOptions: this._map.options || {},
                    geometries: [properties[properties.length - 1]]
                }))
                .openOn(this._map)
        }
    }
})
