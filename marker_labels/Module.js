/**
 * Marker Labels Manager Extension for PILOT
 * ------------------------------------------
 * - Uses the existing PILOT online tree (skeleton.navigation.online.online_tree)
 *   to populate the tracker dropdown and retrieve last fix times.
 * - Adds a left navigation tab with "Add Marker" button.
 * - Modal window to create markers: ID, linked vehicle, description, coordinates.
 * - Stores markers in localStorage.
 * - Main panel displays markers with vehicle name, description, coordinates, and last fix time.
 * - Provides delete and refresh capabilities.
 */

Ext.define('Store.marker_labels.Module', {
    extend: 'Ext.Component',

    // Storage key for localStorage
    storageKey: 'marker_labels_extension',

    // Cache for vehicle list and last times
    vehicleList: [],      // array of { vehid, text, last_time, record }
    markers: [],

    // Main panel reference (to refresh grid)
    mainGrid: null,

    // --------------------------------------------------------------
    // Инициализация расширения (единственная точка входа)
    // --------------------------------------------------------------
    initModule: function () {
        var me = this;

        // Загружаем ранее сохранённые метки
        me.loadMarkers();

        // Создаём левую навигационную панель (Pattern A)
        var navTab = me.createNavTab();

        // Создаём главную панель (будет отображаться в skeleton.mapframe)
        var mainPanel = me.createMainPanel();

        // Обязательная связь: навигационная панель знает, какая главная панель к ней относится
        navTab.map_frame = mainPanel;

        // Добавляем элементы в глобальный скелет PILOT
        if (window.skeleton && skeleton.navigation && skeleton.mapframe) {
            skeleton.navigation.add(navTab);
            skeleton.mapframe.add(mainPanel);
        } else {
            Ext.log.error('Marker Labels: skeleton or its parts not found');
        }
    },

    // --------------------------------------------------------------
    // Загрузка меток из localStorage
    // --------------------------------------------------------------
    loadMarkers: function () {
        var stored = localStorage.getItem(this.storageKey);
        if (stored) {
            try {
                this.markers = Ext.decode(stored);
                if (!Ext.isArray(this.markers)) this.markers = [];
            } catch (e) {
                this.markers = [];
            }
        } else {
            this.markers = [];
        }
    },

    // --------------------------------------------------------------
    // Сохранение меток в localStorage
    // --------------------------------------------------------------
    saveMarkers: function () {
        localStorage.setItem(this.storageKey, Ext.encode(this.markers));
    },

    // --------------------------------------------------------------
    // Создание левой навигационной панели
    // --------------------------------------------------------------
    createNavTab: function () {
        var me = this;

        // Кнопка "Add Marker"
        var addButton = Ext.create('Ext.button.Button', {
            text: l('Add Marker'),
            iconCls: 'fa fa-plus-circle',
            handler: function () {
                me.showAddMarkerDialog();
            },
            margin: '10 10 5 10'
        });

        // Панель, которая будет левой вкладкой
        var navPanel = Ext.create('Ext.panel.Panel', {
            title: l('Marker Labels'),
            iconCls: 'fa fa-map-marker-alt',
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [addButton],
            bodyPadding: '0 0 10 0'
        });

        return navPanel;
    },

    // --------------------------------------------------------------
    // Создание главной панели (список меток)
    // --------------------------------------------------------------
    createMainPanel: function () {
        var me = this;

        // Создаём grid для отображения меток
        var grid = Ext.create('Ext.grid.Panel', {
            title: l('Saved Markers'),
            iconCls: 'fa fa-list',
            store: Ext.create('Ext.data.Store', {
                fields: ['id', 'vehicleId', 'vehicleName', 'description', 'lat', 'lon', 'createdAt', 'lastFixTime'],
                data: []
            }),
            columns: [
                { text: l('Marker ID'), dataIndex: 'id', flex: 1, sortable: true },
                { text: l('Tracker'), dataIndex: 'vehicleName', flex: 1.5, sortable: true },
                { text: l('Description'), dataIndex: 'description', flex: 2, renderer: function(v) { return v || '—'; } },
                { text: l('Latitude'), dataIndex: 'lat', flex: 0.8, align: 'center' },
                { text: l('Longitude'), dataIndex: 'lon', flex: 0.8, align: 'center' },
                { text: l('Last Fix Time'), dataIndex: 'lastFixTime', flex: 1.5, sortable: true },
                {
                    text: l('Actions'),
                    flex: 0.8,
                    align: 'center',
                    renderer: function (value, meta, record) {
                        return '<a href="#" class="marker-delete-btn" data-id="' + Ext.String.htmlEncode(record.get('id')) + '" style="color: #dc2626; text-decoration: none;">🗑️ ' + l('Delete') + '</a>';
                    }
                }
            ],
            listeners: {
                afterrender: function (grid) {
                    grid.getEl().on('click', function (e, t) {
                        var deleteBtn = t.closest('.marker-delete-btn');
                        if (deleteBtn) {
                            e.preventDefault();
                            var markerId = deleteBtn.getAttribute('data-id');
                            me.deleteMarkerById(markerId);
                        }
                    });
                }
            },
            bbar: [
                '->',
                {
                    text: l('Refresh Last Fix Times'),
                    iconCls: 'fa fa-sync-alt',
                    handler: function () {
                        me.refreshVehicleListFromOnlineTree(function() {
                            me.refreshMainGrid();
                        });
                    }
                }
            ]
        });

        // Сохраняем ссылку для обновления
        this.mainGrid = grid;

        // Загружаем список транспортных средств из онлайн-дерева PILOT
        this.refreshVehicleListFromOnlineTree(function() {
            me.refreshMainGrid();
        });

        return grid;
    },

    // --------------------------------------------------------------
    // Получение списка транспортных средств из skeleton.navigation.online.online_tree
    // --------------------------------------------------------------
    refreshVehicleListFromOnlineTree: function(callback) {
        var me = this;
        var onlineTree = skeleton && skeleton.navigation && skeleton.navigation.online && skeleton.navigation.online.online_tree;

        if (!onlineTree) {
            Ext.log.error('Marker Labels: online_tree not found');
            if (callback) callback();
            return;
        }

        // Функция рекурсивного обхода узлов дерева
        function extractVehicles(nodeOrStore) {
            var vehicles = [];
            var store = null;

            // online_tree может быть Ext.tree.Panel, его store находится в .getStore()
            if (onlineTree.getStore) {
                store = onlineTree.getStore();
            } else if (onlineTree.store) {
                store = onlineTree.store;
            } else {
                return vehicles;
            }

            // Рекурсивный обход всех узлов
            function traverse(node) {
                if (!node) return;
                // Проверяем, является ли узел транспортным средством (обычно vehid > 0)
                var vehid = node.get('vehid');
                if (vehid && vehid > 0) {
                    vehicles.push({
                        vehid: vehid,
                        text: node.get('text') || ('Vehicle ' + vehid),
                        last_time: node.get('last_time') || node.get('last_fix') || null,
                        record: node
                    });
                }
                // Рекурсивно обходим дочерние узлы
                if (node.childNodes && node.childNodes.length) {
                    Ext.Array.each(node.childNodes, traverse);
                }
            }

            // Начинаем обход с корневых узлов
            var rootNode = store.getRootNode();
            if (rootNode && rootNode.childNodes) {
                Ext.Array.each(rootNode.childNodes, traverse);
            } else {
                // Если дерево ещё не загружено, подписываемся на событие load
                if (store.isLoading()) {
                    store.on('load', function() {
                        me.refreshVehicleListFromOnlineTree(callback);
                    }, me, { single: true });
                    return;
                }
            }

            me.vehicleList = vehicles;
            if (callback) callback();
        }

        // Если store уже загружен, извлекаем сразу
        var store = onlineTree.getStore ? onlineTree.getStore() : onlineTree.store;
        if (store && !store.isLoading() && store.getRootNode() && store.getRootNode().childNodes.length > 0) {
            extractVehicles();
            if (callback) callback();
        } else {
            // Ждём загрузки
            store.on('load', function() {
                extractVehicles();
                if (callback) callback();
            }, me, { single: true });
        }
    },

    // --------------------------------------------------------------
    // Построение массива меток с актуальным lastFixTime
    // --------------------------------------------------------------
    buildMarkersWithLastFix: function () {
        var me = this;
        var markersWithTime = [];

        // Создаём карту vehid -> { name, last_time } для быстрого доступа
        var vehicleMap = {};
        Ext.Array.each(me.vehicleList, function(v) {
            vehicleMap[v.vehid] = {
                name: v.text,
                last_time: v.last_time
            };
        });

        Ext.Array.each(me.markers, function (marker) {
            var lastFix = '—';
            var vehicleInfo = vehicleMap[marker.vehicleId];
            if (vehicleInfo && vehicleInfo.last_time) {
                lastFix = me.formatLastFixTime(vehicleInfo.last_time);
            } else {
                lastFix = l('Not available');
            }
            markersWithTime.push({
                id: marker.id,
                vehicleId: marker.vehicleId,
                vehicleName: (vehicleInfo && vehicleInfo.name) || marker.vehicleName || '?',
                description: marker.description,
                lat: marker.lat,
                lon: marker.lon,
                createdAt: marker.createdAt,
                lastFixTime: lastFix
            });
        });
        return markersWithTime;
    },

    // --------------------------------------------------------------
    // Форматирование времени последней фиксации
    // --------------------------------------------------------------
    formatLastFixTime: function (rawTime) {
        if (!rawTime) return '—';
        var timestamp = null;
        if (Ext.isNumber(rawTime)) {
            timestamp = rawTime * 1000;
        } else if (Ext.isString(rawTime)) {
            var parsed = Date.parse(rawTime);
            if (!isNaN(parsed)) timestamp = parsed;
        }
        if (timestamp) {
            if (window.dateTimeStr) {
                return window.dateTimeStr(new Date(timestamp));
            } else if (Ext.Date && Ext.Date.format) {
                return Ext.Date.format(new Date(timestamp), 'd.m.Y H:i:s');
            } else {
                return new Date(timestamp).toLocaleString();
            }
        }
        return String(rawTime);
    },

    // --------------------------------------------------------------
    // Обновление главной таблицы
    // --------------------------------------------------------------
    refreshMainGrid: function () {
        if (this.mainGrid && this.mainGrid.getStore()) {
            var newData = this.buildMarkersWithLastFix();
            this.mainGrid.getStore().loadData(newData);
        }
    },

    // --------------------------------------------------------------
    // Удаление метки по ID
    // --------------------------------------------------------------
    deleteMarkerById: function (markerId) {
        var me = this;
        Ext.Msg.confirm(l('Confirm Delete'), l('Delete marker "{0}"?', markerId), function (btn) {
            if (btn === 'yes') {
                me.markers = Ext.Array.filter(me.markers, function (m) {
                    return m.id !== markerId;
                });
                me.saveMarkers();
                me.refreshMainGrid();
            }
        });
    },

    // --------------------------------------------------------------
    // Диалог добавления новой метки
    // --------------------------------------------------------------
    showAddMarkerDialog: function () {
        var me = this;

        // Если список транспортных средств ещё не загружен, загружаем и затем показываем диалог
        if (!this.vehicleList || this.vehicleList.length === 0) {
            Ext.Msg.wait(l('Loading vehicles from online tree...'), l('Please wait'));
            this.refreshVehicleListFromOnlineTree(function() {
                Ext.Msg.hide();
                me._showMarkerFormWindow();
            });
        } else {
            me._showMarkerFormWindow();
        }
    },

    _showMarkerFormWindow: function () {
        var me = this;

        // Combobox для выбора трекера (используем vehicleList)
        var vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: l('Tracker'),
            name: 'vehicleId',
            displayField: 'text',
            valueField: 'vehid',
            store: Ext.create('Ext.data.Store', {
                fields: ['vehid', 'text'],
                data: me.vehicleList.map(function(v) {
                    return { vehid: v.vehid, text: v.text };
                })
            }),
            queryMode: 'local',
            editable: true,
            allowBlank: false,
            blankText: l('Please select a tracker'),
            width: 400,
            labelWidth: 100
        });

        var formPanel = Ext.create('Ext.form.Panel', {
            bodyPadding: 10,
            defaults: {
                anchor: '100%',
                labelWidth: 100
            },
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: l('Marker ID'),
                    name: 'id',
                    allowBlank: false,
                    blankText: l('Marker ID is required'),
                    maxLength: 50,
                    enforceMaxLength: true
                },
                vehicleCombo,
                {
                    xtype: 'textarea',
                    fieldLabel: l('Description'),
                    name: 'description',
                    maxLength: 500,
                    enforceMaxLength: true
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: l('Latitude'),
                    name: 'lat',
                    minValue: -90,
                    maxValue: 90,
                    decimalPrecision: 6,
                    allowBlank: false,
                    blankText: l('Latitude is required')
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: l('Longitude'),
                    name: 'lon',
                    minValue: -180,
                    maxValue: 180,
                    decimalPrecision: 6,
                    allowBlank: false,
                    blankText: l('Longitude is required')
                }
            ]
        });

        var win = Ext.create('Ext.window.Window', {
            title: l('Add New Marker'),
            width: 500,
            modal: true,
            layout: 'fit',
            items: [formPanel],
            buttons: [
                {
                    text: l('Save'),
                    iconCls: 'fa fa-save',
                    handler: function () {
                        if (!formPanel.isValid()) {
                            Ext.Msg.alert(l('Error'), l('Please fill all required fields.'));
                            return;
                        }
                        var values = formPanel.getForm().getValues();
                        var markerId = values.id.trim();
                        // Проверка уникальности ID
                        var exists = Ext.Array.some(me.markers, function (m) { return m.id === markerId; });
                        if (exists) {
                            Ext.Msg.alert(l('Error'), l('Marker ID already exists. Please choose a unique ID.'));
                            return;
                        }
                        var selectedRecord = vehicleCombo.findRecordByValue(values.vehicleId);
                        var vehicleName = selectedRecord ? selectedRecord.get('text') : '';
                        var newMarker = {
                            id: markerId,
                            vehicleId: parseInt(values.vehicleId, 10),
                            vehicleName: vehicleName,
                            description: values.description || '',
                            lat: parseFloat(values.lat),
                            lon: parseFloat(values.lon),
                            createdAt: Date.now()
                        };
                        me.markers.push(newMarker);
                        me.saveMarkers();
                        win.close();
                        me.refreshMainGrid();
                        Ext.toast({
                            html: l('Marker "{0}" added', markerId),
                            title: l('Success'),
                            width: 250,
                            icon: Ext.Msg.INFO
                        });
                    }
                },
                {
                    text: l('Cancel'),
                    handler: function () { win.close(); }
                }
            ]
        });
        win.show();
    }
});
