/**
 * Marker Labels Manager Extension for PILOT
 * ------------------------------------------
 * - Adds a left navigation tab with "Add Marker" button.
 * - Modal window to create markers: ID, linked vehicle, description, coordinates.
 * - Stores markers in localStorage.
 * - Main panel displays markers with vehicle name, description, coordinates, and last fix time.
 * - Last fix time is obtained from /ax/tree.php (assumes each vehicle has 'last_time' field).
 * - Provides delete and refresh capabilities.
 */

Ext.define('Store.marker_labels.Module', {
    extend: 'Ext.Component',

    // Storage key for localStorage
    storageKey: 'marker_labels_extension',

    // Cache for vehicle list and last times
    vehicleStore: null,
    vehicleMap: {},      // vehid -> { name, last_time }
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
            // Добавим небольшой отступ внизу, чтобы кнопка не прилипала
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
                data: me.buildMarkersWithLastFix()
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
                // Делегирование события удаления
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
                        me.refreshLastFixTimes();
                    }
                }
            ]
        });

        // Сохраняем ссылку для обновления
        this.mainGrid = grid;

        // Загружаем справочник транспорта (нужен для lastFixTime и vehicleName)
        this.loadVehicleList(function () {
            me.refreshMainGrid();
        });

        return grid;
    },

    // --------------------------------------------------------------
    // Загрузка списка транспорта из /ax/tree.php
    // --------------------------------------------------------------
    loadVehicleList: function (callback) {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function (resp) {
                var data = Ext.decode(resp.responseText);
                me.vehicleMap = {};
                me.vehicleStore = [];

                // Рекурсивный обход дерева для сбора всех узлов с vehid > 0
                function traverse(nodes) {
                    if (!nodes || !nodes.length) return;
                    Ext.Array.each(nodes, function (node) {
                        if (node.vehid && node.vehid > 0) {
                            me.vehicleMap[node.vehid] = {
                                name: node.text || ('Vehicle ' + node.vehid),
                                last_time: node.last_time || node.last_fix || null
                            };
                            me.vehicleStore.push({
                                vehid: node.vehid,
                                text: node.text,
                                last_time: node.last_time || node.last_fix
                            });
                        }
                        if (node.children && node.children.length) {
                            traverse(node.children);
                        }
                    });
                }
                traverse(data);
                if (callback) callback();
            },
            failure: function () {
                Ext.Msg.alert(l('Error'), l('Failed to load vehicle list from PILOT.'));
                if (callback) callback();
            }
        });
    },

    // --------------------------------------------------------------
    // Построение массива меток с актуальным lastFixTime
    // --------------------------------------------------------------
    buildMarkersWithLastFix: function () {
        var me = this;
        var markersWithTime = [];

        Ext.Array.each(me.markers, function (marker) {
            var lastFix = '—';
            if (me.vehicleMap[marker.vehicleId] && me.vehicleMap[marker.vehicleId].last_time) {
                var rawTime = me.vehicleMap[marker.vehicleId].last_time;
                // Преобразуем в читаемый формат, если возможно
                lastFix = me.formatLastFixTime(rawTime);
            } else {
                // Можно попробовать получить из online_tree в рантайме, но оставим заглушку
                lastFix = l('Not available');
            }
            markersWithTime.push({
                id: marker.id,
                vehicleId: marker.vehicleId,
                vehicleName: (me.vehicleMap[marker.vehicleId] && me.vehicleMap[marker.vehicleId].name) || marker.vehicleName || '?',
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
        // PILOT часто возвращает Unix timestamp (секунды) или строку
        var timestamp = null;
        if (Ext.isNumber(rawTime)) {
            timestamp = rawTime * 1000; // в миллисекунды
        } else if (Ext.isString(rawTime)) {
            // Пытаемся распарсить
            var parsed = Date.parse(rawTime);
            if (!isNaN(parsed)) timestamp = parsed;
            else timestamp = null;
        }
        if (timestamp) {
            // Используем глобальный форматтер, если доступен, иначе Ext.Date
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
    // Обновление только last fix times (перезагрузка справочника)
    // --------------------------------------------------------------
    refreshLastFixTimes: function () {
        var me = this;
        me.loadVehicleList(function () {
            me.refreshMainGrid();
            Ext.toast({
                html: l('Last fix times updated'),
                title: l('Marker Labels'),
                width: 250,
                icon: Ext.Msg.INFO
            });
        });
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

        // Сначала убедимся, что список транспортных средств загружен
        if (!this.vehicleStore || this.vehicleStore.length === 0) {
            Ext.Msg.wait(l('Loading vehicles...'), l('Please wait'));
            this.loadVehicleList(function () {
                Ext.Msg.hide();
                me._showMarkerFormWindow();
            });
        } else {
            me._showMarkerFormWindow();
        }
    },

    _showMarkerFormWindow: function () {
        var me = this;

        // Combobox для выбора трекера
        var vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: l('Tracker'),
            name: 'vehicleId',
            displayField: 'text',
            valueField: 'vehid',
            store: Ext.create('Ext.data.Store', {
                fields: ['vehid', 'text'],
                data: me.vehicleStore
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
