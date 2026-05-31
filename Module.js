/**
 * Extension for PILOT – Доп. Оборудование
 * Левая панель: поиск по ТС + фильтр по датчику.
 * Правая панель: чекбоксы для выбранного ТС отображаются в виде таблицы (layout: 'table'),
 * контейнер прозрачный, чекбоксы всегда чёрные и чёткие.
 * При загрузке автоматически выбирается первый ТС из списка.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    sensors: [
        { name: 'aog', label: 'АОГ' },
        { name: 'video', label: 'Видео' },
        { name: 'tablo', label: 'Табло' },
        { name: 'voice', label: 'Голос' },
        { name: 'tf', label: 'ТФ' },
        { name: 'kpp', label: 'КПП' },
        { name: 'thg', label: 'ТХГ' },
        { name: 'dut', label: 'ДУТ' },
        { name: 'temp_sensor', label: 'Датчик t' }
    ],

    initModule: function () {
        var me = this;
        me.addCustomStyles();

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'Доп. Оборудование',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [me.createVehicleList()]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;

        me.refreshDashboard();
    },

    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            /* Табличный контейнер чекбоксов – прозрачный */
            .sensors-table-container {
                background: transparent !important;
                padding: 12px 15px;
                border-bottom: 1px solid #e0e4e8;
                width: 100%;
            }
            .sensors-table-container table {
                width: 100%;
                border-collapse: collapse;
            }
            .sensors-table-container td {
                padding: 6px 10px;
                vertical-align: middle;
                border: none;
            }
            /* Каждый чекбокс с подписью */
            .sensor-checkbox-item {
                white-space: nowrap;
            }
            .sensor-checkbox-item.locked .x-form-cb-label:after {
                content: " 🔒";
                font-size: 11px;
                opacity: 0.8;
                margin-left: 4px;
            }
            /* Всегда чёрный текст и чекбокс (без прозрачности) */
            .x-form-cb-label {
                color: #000000 !important;
                font-weight: normal !important;
                opacity: 1 !important;
            }
            .x-form-checkbox {
                opacity: 1 !important;
            }
            /* Неактивные чекбоксы – чёткие, чёрные, но с замком */
            .x-form-checkbox:disabled {
                opacity: 1 !important;
                background-color: transparent !important;
                border-color: #666666 !important;
            }
            .x-form-field:disabled + .x-form-cb-label {
                opacity: 1 !important;
                color: #000000 !important;
            }
            /* Панель дашборда */
            .dashboard-panel {
                margin: 15px 10px;
                background: #ffffff;
                border: 1px solid #e0e4e8;
                border-radius: 4px;
            }
            .dashboard-grid .x-grid-header {
                background: #f5f5f5;
            }
            /* Поля поиска и фильтра */
            .vehicle-search-field, .sensor-filter-combo {
                margin: 5px;
                width: 180px;
            }
        `;
        document.head.appendChild(styleEl);
    },

    getApiUrl: function (endpoint) {
        var origin = window.location.origin;
        if (origin.slice(-1) === '/') origin = origin.slice(0, -1);
        if (endpoint.charAt(0) === '/') endpoint = endpoint.slice(1);
        return origin + '/' + endpoint;
    },

    createVehicleList: function () {
        var me = this;
        var apiUrl = me.getApiUrl('ax/tree.php');

        var fullStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name'],
            proxy: {
                type: 'ajax',
                url: apiUrl,
                extraParams: { vehs: 1, state: 1 },
                reader: {
                    type: 'json',
                    rootProperty: 'children',
                    transform: function(data) {
                        var vehicles = [];
                        function traverse(nodes) {
                            Ext.each(nodes, function(node) {
                                if (node.vehid) {
                                    vehicles.push({
                                        vehid: node.vehid,
                                        name: node.name
                                    });
                                }
                                if (node.children && node.children.length) {
                                    traverse(node.children);
                                }
                            });
                        }
                        traverse(data);
                        return vehicles;
                    }
                }
            },
            autoLoad: true
        });

        var searchField = Ext.create('Ext.form.field.Text', {
            cls: 'vehicle-search-field',
            emptyText: 'Поиск ТС...',
            enableKeyEvents: true,
            triggers: {
                clear: {
                    cls: 'x-form-clear-trigger',
                    handler: function() {
                        searchField.reset();
                        me.applyVehicleFilters();
                    }
                }
            },
            listeners: {
                keyup: function() {
                    me.applyVehicleFilters();
                }
            }
        });

        var sensorFilterCombo = Ext.create('Ext.form.field.ComboBox', {
            cls: 'sensor-filter-combo',
            emptyText: 'Фильтр по датчику',
            store: Ext.create('Ext.data.Store', {
                fields: ['value', 'label'],
                data: [
                    { value: null, label: 'Все датчики' }
                ].concat(Ext.Array.map(me.sensors, function(s) {
                    return { value: s.name, label: s.label };
                }))
            }),
            queryMode: 'local',
            displayField: 'label',
            valueField: 'value',
            value: null,
            listeners: {
                select: function() { me.applyVehicleFilters(); },
                clear: function() { me.applyVehicleFilters(); }
            }
        });

        var grid = Ext.create('Ext.grid.Panel', {
            store: Ext.create('Ext.data.Store', { fields: ['vehid', 'name'], data: [] }),
            columns: [{ text: 'ТС', dataIndex: 'name', flex: 1 }],
            tbar: [searchField, sensorFilterCombo],
            listeners: {
                selectionchange: function (selModel, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        me.loadConfigForVehicle(record.get('vehid'), record.get('name'));
                    } else {
                        me.clearConfigForm();
                    }
                }
            }
        });

        me.vehicleFullStore = fullStore;
        me.vehicleGridStore = grid.getStore();
        me.searchField = searchField;
        me.sensorFilterCombo = sensorFilterCombo;

        fullStore.on('load', function() {
            me.applyVehicleFilters();
            var firstRecord = me.vehicleGridStore.getAt(0);
            if (firstRecord) {
                grid.getSelectionModel().select(firstRecord);
            }
        });

        return grid;
    },

    applyVehicleFilters: function() {
        var me = this;
        var fullStore = me.vehicleFullStore;
        var gridStore = me.vehicleGridStore;
        if (!fullStore || !gridStore) return;

        var searchValue = me.searchField ? me.searchField.getValue() : '';
        var selectedSensor = me.sensorFilterCombo ? me.sensorFilterCombo.getValue() : null;

        var filtered = [];
        fullStore.each(function(record) {
            var vehid = record.get('vehid');
            var name = record.get('name');

            var textOk = Ext.isEmpty(searchValue) || name.toLowerCase().indexOf(searchValue.toLowerCase()) !== -1;
            if (!textOk) return;

            var sensorOk = true;
            if (selectedSensor) {
                var storageKey = 'sensor_dashboard_' + vehid;
                var saved = localStorage.getItem(storageKey);
                var values = saved ? JSON.parse(saved) : {};
                sensorOk = (values[selectedSensor] === 'yes');
            }
            if (!sensorOk) return;

            filtered.push(record.copy());
        });

        gridStore.loadData(filtered);

        if (gridStore.getCount() === 0) {
            me.clearConfigForm();
            return;
        }

        var selectedRecord = me.getSelectedVehicleFromGrid();
        if (!selectedRecord) {
            var first = gridStore.getAt(0);
            if (first) me.selectVehicleInGrid(first);
        } else {
            var exists = false;
            gridStore.each(function(rec) {
                if (rec.get('vehid') === selectedRecord.vehid) exists = true;
            });
            if (!exists && gridStore.getCount() > 0) {
                me.selectVehicleInGrid(gridStore.getAt(0));
            }
        }
    },

    selectVehicleInGrid: function(record) {
        var grid = this.navTab.items.get(0);
        if (grid && grid.getSelectionModel) grid.getSelectionModel().select(record);
    },

    getSelectedVehicleFromGrid: function() {
        var grid = this.navTab.items.get(0);
        if (grid && grid.getSelectionModel) {
            var selected = grid.getSelectionModel().getSelection();
            if (selected && selected.length) {
                return { vehid: selected[0].get('vehid'), name: selected[0].get('name') };
            }
        }
        return null;
    },

    createMainPanel: function () {
        var me = this;

        // Табличный контейнер для чекбоксов (3 колонки, можно изменить)
        var tableContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsTableContainer',
            layout: {
                type: 'table',
                columns: 3,          // количество столбцов таблицы
                tableAttrs: { style: { width: '100%', borderCollapse: 'collapse' } },
                tdAttrs: { style: { padding: '6px 10px', verticalAlign: 'middle' } }
            },
            cls: 'sensors-table-container',
            defaults: { margin: 0 }
        });

        var dashboardStore = Ext.create('Ext.data.Store', {
            fields: ['sensor', 'totalVehicles', 'enabledCount', 'percentage'],
            data: []
        });

        var dashboardGrid = Ext.create('Ext.grid.Panel', {
            store: dashboardStore,
            cls: 'dashboard-grid',
            autoHeight: true,
            scrollable: false,
            columns: [
                { text: 'Датчик', dataIndex: 'sensor', flex: 2 },
                { text: 'Всего ТС', dataIndex: 'totalVehicles', flex: 1 },
                { text: 'Включено', dataIndex: 'enabledCount', flex: 1 },
                { text: '%', dataIndex: 'percentage', flex: 1, renderer: function(v) { return v + ' %'; } }
            ],
            viewConfig: { stripeRows: true, emptyText: 'Нет данных' }
        });

        var dashboardPanel = Ext.create('Ext.panel.Panel', {
            title: 'Статистика по всем объектам',
            cls: 'dashboard-panel',
            layout: 'fit',
            items: [dashboardGrid],
            collapsible: true,
            collapsed: false,
            autoHeight: true
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', style: 'font-weight: bold; font-size: 13px;' },
                '->',
                { text: 'Редактировать', handler: function () { me.setSensorsEditable(true); } },
                { text: 'Применить', handler: function () { me.saveCurrentConfig(); me.setSensorsEditable(false); me.refreshDashboard(); } }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: { type: 'vbox', align: 'stretch' },
            tbar: tbar,
            items: [ tableContainer, { xtype: 'component', height: 10 }, dashboardPanel ]
        });

        mainPanel.sensorsTableContainer = tableContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.dashboardGrid = dashboardGrid;

        return mainPanel;
    },

    // Создание чекбоксов в табличном контейнере
    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        var container = me.mainPanel.sensorsTableContainer;
        var label = me.mainPanel.vehicleLabel;

        label.setText(vehicleName);
        container.removeAll(); // очищаем таблицу

        var storageKey = 'sensor_dashboard_' + vehid;
        var saved = localStorage.getItem(storageKey);
        var values = saved ? JSON.parse(saved) : {};

        // Добавляем чекбоксы в таблицу, распределяя по колонкам (задано columns:3)
        Ext.each(me.sensors, function(sensor, index) {
            var checked = (values[sensor.name] === 'yes');
            var checkbox = Ext.create('Ext.form.field.Checkbox', {
                fieldLabel: sensor.label,
                labelAlign: 'right',
                itemId: sensor.name,
                checked: checked,
                disabled: true,
                labelCls: 'x-form-cb-label'
            });
            var wrapper = Ext.create('Ext.container.Container', {
                cls: 'sensor-checkbox-item',
                items: [checkbox],
                style: 'white-space: nowrap;'
            });
            // Добавляем в таблицу: ячейка (td)
            container.add(wrapper);
            checkbox.wrapper = wrapper;
            if (checkbox.disabled) wrapper.addCls('locked');
        });

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.refreshDashboard();
    },

    setSensorsEditable: function (editable) {
        var container = this.mainPanel.sensorsTableContainer;
        Ext.each(this.sensors, function (sensor) {
            var wrapper = container.down('#' + sensor.name)?.ownerCt;
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                checkbox.setDisabled(!editable);
                if (wrapper) {
                    if (editable) wrapper.removeCls('locked');
                    else wrapper.addCls('locked');
                }
            }
        });
    },

    saveCurrentConfig: function () {
        var me = this;
        if (!me.currentVehid) return;

        var container = me.mainPanel.sensorsTableContainer;
        var values = {};

        Ext.each(me.sensors, function (sensor) {
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                values[sensor.name] = checkbox.checked ? 'yes' : 'no';
            }
        });

        var storageKey = 'sensor_dashboard_' + me.currentVehid;
        localStorage.setItem(storageKey, JSON.stringify(values));
        Ext.Msg.alert('Сохранено', 'Настройки сохранены');
        me.applyVehicleFilters();
    },

    refreshDashboard: function () {
        var me = this;
        var store = me.mainPanel.dashboardStore;
        if (!store) return;

        var fullStore = me.vehicleFullStore;
        var allVehicles = [];
        if (fullStore) {
            fullStore.each(function(record) { allVehicles.push(record.get('vehid')); });
        }
        var totalVehicleCount = allVehicles.length;

        var totals = {};
        Ext.each(me.sensors, function(s) { totals[s.name] = 0; });

        Ext.each(allVehicles, function(vehid) {
            var storageKey = 'sensor_dashboard_' + vehid;
            var saved = localStorage.getItem(storageKey);
            var values = saved ? JSON.parse(saved) : {};
            Ext.each(me.sensors, function(s) {
                if (values[s.name] === 'yes') totals[s.name]++;
            });
        });

        var data = [];
        Ext.each(me.sensors, function(sensor) {
            var enabled = totals[sensor.name];
            var percent = totalVehicleCount ? Math.round((enabled / totalVehicleCount) * 100) : 0;
            data.push({
                sensor: sensor.label,
                totalVehicles: totalVehicleCount,
                enabledCount: enabled,
                percentage: percent
            });
        });
        store.loadData(data);
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        if (mainPanel && mainPanel.sensorsTableContainer) {
            mainPanel.sensorsTableContainer.removeAll();
            mainPanel.vehicleLabel.setText('ТС не выбрано');
        }
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
