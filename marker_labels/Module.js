Ext.define('Store.marker_labels.Module', {
    extend: 'Ext.Component',

    storageKey: 'marker_labels_extension',
    markers: [],
    vehicleList: [],
    mainGrid: null,

    initModule: function () {
        var me = this;
        me.loadMarkers();

        // Пытаемся взять данные из online_tree PILOT
        if (!me.loadVehiclesFromPilotTree()) {
            // Fallback через Ajax
            me.loadVehiclesViaAjax();
        }

        var navTab = me.createNavTab();
        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        if (window.skeleton && skeleton.navigation && skeleton.mapframe) {
            skeleton.navigation.add(navTab);
            skeleton.mapframe.add(mainPanel);
        }
    },

    loadVehiclesFromPilotTree: function () {
        try {
            var tree = skeleton.navigation.online.online_tree;
            if (!tree || !tree.getStore) return false;
            var root = tree.getStore().getRootNode();
            if (!root) return false;
            this.vehicleList = [];
            this.collectVehicles(root);
            return this.vehicleList.length > 0;
        } catch(e) { return false; }
    },

    collectVehicles: function (node) {
        if (node.data && node.data.vehid > 0) {
            this.vehicleList.push({
                vehid: node.data.vehid,
                text: node.data.text || node.data.name,
                last_time: node.data.last_time || node.data.last_fix
            });
        }
        if (node.childNodes) {
            Ext.each(node.childNodes, function(c) { this.collectVehicles(c); }, this);
        }
    },

    loadVehiclesViaAjax: function () {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(resp) {
                var data = Ext.decode(resp.responseText);
                me.vehicleList = [];
                me.traverse(data);
                if (me.mainGrid) me.refreshMainGrid();
            },
            failure: function() { Ext.Msg.alert('Error', 'Cannot load vehicles'); }
        });
    },

    traverse: function(nodes) {
        if (!nodes) return;
        Ext.each(nodes, function(node) {
            if (node.vehid > 0) {
                this.vehicleList.push({
                    vehid: node.vehid,
                    text: node.text,
                    last_time: node.last_time
                });
            }
            if (node.children) this.traverse(node.children);
        }, this);
    },

    loadMarkers: function() {
        var stored = localStorage.getItem(this.storageKey);
        this.markers = stored ? Ext.decode(stored) : [];
    },

    saveMarkers: function() {
        localStorage.setItem(this.storageKey, Ext.encode(this.markers));
    },

    createNavTab: function() {
        var me = this;
        var addBtn = Ext.create('Ext.button.Button', {
            text: l('Add Marker'),
            iconCls: 'fa fa-plus-circle',
            handler: function() { me.showAddDialog(); },
            margin: '10'
        });
        return Ext.create('Ext.panel.Panel', {
            title: l('Marker Labels'),
            iconCls: 'fa fa-map-marker-alt',
            layout: 'vbox',
            items: [addBtn],
            bodyPadding: 5
        });
    },

    createMainPanel: function() {
        var me = this;
        var grid = Ext.create('Ext.grid.Panel', {
            title: l('Saved Markers'),
            store: Ext.create('Ext.data.Store', {
                fields: ['id', 'vehicleName', 'description', 'lat', 'lon', 'lastFixTime']
            }),
            columns: [
                { text: 'Marker ID', dataIndex: 'id', flex: 1 },
                { text: 'Tracker', dataIndex: 'vehicleName', flex: 1.5 },
                { text: 'Description', dataIndex: 'description', flex: 2, renderer: function(v){ return v || '—'; } },
                { text: 'Lat', dataIndex: 'lat', flex: 0.8 },
                { text: 'Lon', dataIndex: 'lon', flex: 0.8 },
                { text: 'Last Fix Time', dataIndex: 'lastFixTime', flex: 1.5 },
                { text: 'Actions', flex: 0.8, renderer: function(v,m,rec){
                    return '<a href="#" data-id="'+rec.get('id')+'" class="del-marker" style="color:#dc2626">Delete</a>';
                }}
            ],
            bbar: ['->', { text: 'Refresh Last Fix', iconCls: 'fa-refresh', handler: function(){ me.refreshLastFix(); } }],
            listeners: {
                afterrender: function(g){
                    g.getEl().on('click', function(e,t){
                        var del = t.closest('.del-marker');
                        if(del) me.deleteMarker(del.getAttribute('data-id'));
                    });
                }
            }
        });
        this.mainGrid = grid;
        this.refreshMainGrid();
        return grid;
    },

    refreshMainGrid: function() {
        if (!this.mainGrid) return;
        var data = [];
        var me = this;
        Ext.each(this.markers, function(m) {
            var vehicle = Ext.Array.findBy(me.vehicleList, function(v) { return v.vehid == m.vehicleId; });
            var vehicleName = vehicle ? vehicle.text : m.vehicleName;
            var lastFix = '—';
            if (vehicle && vehicle.last_time) {
                var ts = vehicle.last_time;
                if (typeof ts === 'number') ts = ts * 1000;
                lastFix = window.dateTimeStr ? window.dateTimeStr(new Date(ts)) : new Date(ts).toLocaleString();
            }
            data.push({
                id: m.id,
                vehicleName: vehicleName,
                description: m.description,
                lat: m.lat,
                lon: m.lon,
                lastFixTime: lastFix
            });
        });
        this.mainGrid.getStore().loadData(data);
    },

    refreshLastFix: function() {
        this.loadVehiclesFromPilotTree();
        this.refreshMainGrid();
        Ext.toast('Last fix times updated');
    },

    deleteMarker: function(id) {
        var me = this;
        Ext.Msg.confirm('Confirm', 'Delete marker "'+id+'"?', function(btn){
            if(btn==='yes'){
                me.markers = Ext.Array.filter(me.markers, function(m){ return m.id !== id; });
                me.saveMarkers();
                me.refreshMainGrid();
            }
        });
    },

    showAddDialog: function() {
        var me = this;
        if (!this.vehicleList.length) {
            Ext.Msg.alert('Error', 'No vehicles loaded. Please wait or refresh the page.');
            return;
        }
        var combo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: 'Tracker',
            displayField: 'text',
            valueField: 'vehid',
            store: Ext.create('Ext.data.Store', { fields: ['vehid','text'], data: this.vehicleList }),
            queryMode: 'local',
            allowBlank: false,
            width: 400
        });
        var form = Ext.create('Ext.form.Panel', {
            bodyPadding: 10,
            items: [
                { xtype: 'textfield', fieldLabel: 'Marker ID', name: 'id', allowBlank: false },
                combo,
                { xtype: 'textarea', fieldLabel: 'Description', name: 'description' },
                { xtype: 'numberfield', fieldLabel: 'Latitude', name: 'lat', minValue: -90, maxValue: 90, allowBlank: false },
                { xtype: 'numberfield', fieldLabel: 'Longitude', name: 'lon', minValue: -180, maxValue: 180, allowBlank: false }
            ]
        });
        var win = Ext.create('Ext.window.Window', {
            title: 'Add Marker',
            width: 500,
            modal: true,
            items: form,
            buttons: [{
                text: 'Save',
                handler: function() {
                    if (!form.isValid()) return;
                    var vals = form.getForm().getValues();
                    var id = vals.id.trim();
                    if (Ext.Array.some(me.markers, function(m){ return m.id === id; })) {
                        Ext.Msg.alert('Error', 'Marker ID already exists');
                        return;
                    }
                    var veh = combo.findRecordByValue(vals.vehicleId);
                    if (!veh) return;
                    me.markers.push({
                        id: id,
                        vehicleId: parseInt(vals.vehicleId,10),
                        vehicleName: veh.get('text'),
                        description: vals.description,
                        lat: parseFloat(vals.lat),
                        lon: parseFloat(vals.lon),
                        createdAt: Date.now()
                    });
                    me.saveMarkers();
                    win.close();
                    me.refreshMainGrid();
                }
            },{ text: 'Cancel', handler: function(){ win.close(); } }]
        });
        win.show();
    }
});
