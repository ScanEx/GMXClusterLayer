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
        var layer = this.options.dataLayer

        var markers = data.added.map((vectorTileItem) => {
            // var itemProperties = layer.getItemProperties(vectorTileItem.properties)
            var itemGeoJson = vectorTileItem.properties[vectorTileItem.properties.length - 1]
            if (itemGeoJson.type !== 'POINT') {
                return
            }

            var itemStyle = vectorTileItem.item.parsedStyleKeys || layer.getItemStyle(vectorTileItem.id)

            var latlng = L.Projection.Mercator.unproject({
                x: itemGeoJson.coordinates[0],
                y: itemGeoJson.coordinates[1]
            })

            if (itemStyle.iconUrl) {
                return createIconMarker(latlng, itemStyle)
            } else {
                return L.marker(latlng)
            }
        }).filter(function (item) {
            return !!item
        })

        this._markerClusterGroup.clearLayers()
        this._markerClusterGroup.addLayers(markers)

        function createIconMarker(latlng, itemStyle) {
            if (itemStyle.rotate) {
                return rotatedMarker(latlng, {
                    icon: createIconMarkerIcon(itemStyle),
                    angle: itemStyle.rotate
                })
            } else {
                return L.marker(latlng, {
                    icon: createIconMarkerIcon(itemStyle)
                })
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
    }
})
