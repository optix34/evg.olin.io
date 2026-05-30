/**
 * Extension for PILOT – Доп. Оборудование
 * Без левой панели. Кнопка в хедере открывает окно с деревом ТС, чекбоксами и статистикой.
 * Полностью соответствует паттерну E (AI_SPECS.md).
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

        // Кнопка в хедере
        if (skeleton && skeleton.header && skeleton.header.insert) {
            skeleton.header.insert(5, {
                xtype: 'button',
                cls: 'header_tool dop-oborudovanie-header-btn',
                iconCls: 'fa fa-microchip',
                tooltip: 'Доп. Оборудование',
                handler: function () { me.openMainWindow(); },
                scope: me
            });
        }

        me.currentVehid = null;
        me.currentVehicleName = null;
        me.mainWindow = null;
        me.mainPanel = null;
    },

    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            .dop-oborudovanie-header-btn {
                background: #2563eb !important;
                border-color: #1d4ed8 !important;
            }
            .dop-oborudovanie-header-btn .x-btn-inner,
            .dop-oborudovanie-header-btn .x-btn-icon-el {
                color: #ffffff !important;
            }
            .dop-oborudovanie-header-btn:hover {
                background: #1d4ed8 !important;
            }

            .sensor-checkbox-item {
                display: inline-block;
                margin: 5px 15px 5px 0;
                white-space: nowrap;
            }
            .sensor-checkbox-item.locked .x-form-cb-label:after {
                content: " 🔒";
                font-size: 11px;
                opacity: 0.6;
                margin-left: 4px;
            }
            .sensors-hbox-container {
                background: #ffffff;
                padding: 12px 15px;
                border-bottom: 1px solid #e0e4e8;
            }
            .dashboard-panel {
                margin: 15px 10px;
                background: #ffffff;
                border: 1px solid #e0e4e8;
                border-radius: 4px;
            }
            .dashboard-grid .x-grid-header {
                background: #f5f5f5;
            }
            .x-form-checkbox:disabled {
                opacity: 0.6;
            }
            .x-form-field:disabled + .x-form-cb-label {
                color: #000000 !important;
                opacity: 0.6;
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

    // Создание дерева ТС (полностью независимое от левой панели)
    createVehicleTree: function () {
        var me = this;
        var apiUrl = me.getApiUrl('ax/tree.php');

        var treeStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: apiUrl,
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: 'children' }
            },
            root: { expanded: true, text: 'Все ТС' }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: treeStore,
            rootVisible: true,
            useArrows: true,
            title: 'Транспортные средства',
            width: 320,
            height: '100%',
            columns: [{
                xtype: 'treecolumn',
                text: 'ТС',
                dataIndex: 'name',
                flex: 2
            }, {
                text: 'Метка BLE (IButton)',
                dataIndex: 'ibutton',
                flex: 1,
                renderer: function (v, meta, record) {
                    if (v) return v;
                    if (record && record.get) {
                        if (record.get('iButton')) return record.get('iButton');
                        if (record.get('ibtn')) return record.get('ibtn');
                        if (record.get('key_id')) return record.get('key_id');
                        if (record.get('ble_label')) return record.get('ble_label');
                        if (record.get('ble_tag')) return record.get('ble_tag');
                        if (record.get('ble')) return record.get('ble');
                    }
                    return '—';
                }
            }, {
                text: 'Год',
                dataIndex: 'year',
                flex: 1,
                renderer: function (v) { return v || '—'; }
            }],
            listeners: {
                selectionchange: function (selModel, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('vehid')) {
                            me.loadConfigForVehicle(record.get('vehid'), record.get('name'));
                        } else {
                            me.clearConfigForm();
                        }
                    }
                }
            }
        });

        return tree;
    },

    // Создание правой части окна (чекбоксы + дашборд)
    createRightPanel: function () {
        var me = this;

        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            layout: {
                type: 'hbox',
                align: 'middle',
                pack: 'start',
                wrap: true
            },
            cls: 'sensors-hbox-container'
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
            columns: [{
                text: 'Датчик',
                dataIndex: 'sensor',
                flex: 2
            }, {
                text: 'Всего ТС',
                dataIndex: 'totalVehicles',
                flex: 1
            }, {
                text: 'Включено',
                dataIndex: 'enabledCount',
                flex: 1
            }, {
                text: '%',
                dataIndex: 'percentage',
                flex: 1,
                renderer: function(v) { return v + ' %'; }
            }],
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

        var rightPanel = Ext.create('Ext.panel.Panel', {
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            tbar: tbar,
            items: [
                fieldContainer,
                { xtype: 'component', height: 10 },
                dashboardPanel
            ],
            flex: 1
        });

        rightPanel.sensorsContainer = fieldContainer;
        rightPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        rightPanel.dashboardStore = dashboardStore;
        rightPanel.dashboardGrid = dashboardGrid;

        me.rightPanel = rightPanel;
        return rightPanel;
    },

    // Создание главного окна с разделением на две колонки
    createMainWindow: function () {
        var me = this;
        var tree = me.createVehicleTree();
        var rightPanel = me.createRightPanel();

        var mainContainer = Ext.create('Ext.container.Container', {
            layout: 'hbox',
            items: [tree, rightPanel],
            defaults: { border: false }
        });

        var win = Ext.create('Ext.window.Window', {
            title: 'Доп. Оборудование',
            iconCls: 'fa fa-microchip',
            layout: 'fit',
            items: [mainContainer],
            width: 1100,
            height: 650,
            modal: true,
            constrain: true,
            closable: true,
            resizable: true,
            listeners: {
                close: function () {
                    me.mainWindow = null;
                    me.rightPanel = null;
                    me.currentVehid = null;
                }
            }
        });

        return win;
    },

    openMainWindow: function () {
        var me = this;
        if (me.mainWindow) {
            me.mainWindow.show();
            return;
        }
        me.mainWindow = me.createMainWindow();
        me.mainWindow.show();
    },

    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        if (!me.rightPanel) return;

        var container = me.rightPanel.sensorsContainer;
        var label = me.rightPanel.vehicleLabel;

        label.setText(vehicleName);
        container.removeAll();

        var storageKey = 'sensor_dashboard_' + vehid;
        var saved = localStorage.getItem(storageKey);
        var values = saved ? JSON.parse(saved) : {};

        Ext.each(me.sensors, function (sensor) {
            var checked = (values[sensor.name] === 'yes');
            var checkbox = Ext.create('Ext.form.field.Checkbox', {
                fieldLabel: sensor.label,
                labelAlign: 'right',
                itemId: sensor.name,
                checked: checked,
                disabled: true
            });
            var wrapper = Ext.create('Ext.container.Container', {
                cls: 'sensor-checkbox-item',
                items: [checkbox],
                margin: '0 15 0 0'
            });
            container.add(wrapper);
            checkbox.wrapper = wrapper;
            if (checkbox.disabled) wrapper.addCls('locked');
        });

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.refreshDashboard();
    },

    setSensorsEditable: function (editable) {
        if (!this.rightPanel) return;
        var container = this.rightPanel.sensorsContainer;
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
        if (!me.currentVehid || !me.rightPanel) return;

        var container = me.rightPanel.sensorsContainer;
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
    },

    refreshDashboard: function () {
        var me = this;
        if (!me.rightPanel) return;
        var store = me.rightPanel.dashboardStore;
        if (!store) return;

        // Собираем все vehid из дерева (оно сейчас находится в открытом окне)
        // Но проще взять из основного дерева PILOT, чтобы статистика была полной
        var allVehicles = [];
        var tree = null;
        if (skeleton && skeleton.navigation && skeleton.navigation.online && skeleton.navigation.online.online_tree) {
            tree = skeleton.navigation.online.online_tree;
        } else {
            store.loadData([]);
            return;
        }

        var rootNode = tree.getRootNode();
        if (rootNode) {
            me.collectVehicles(rootNode, allVehicles);
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

    collectVehicles: function(node, array) {
        var me = this;
        if (node.get('vehid')) {
            array.push(node.get('vehid'));
        }
        var childNodes = node.childNodes;
        if (childNodes) {
            Ext.each(childNodes, function(child) {
                me.collectVehicles(child, array);
            });
        }
    },

    clearConfigForm: function () {
        if (!this.rightPanel) return;
        var rightPanel = this.rightPanel;
        rightPanel.sensorsContainer.removeAll();
        rightPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
