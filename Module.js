/**
 * Extension for PILOT – Доп. Оборудование
 * Верхняя часть: чекбоксы для выбранного ТС (АОГ, Видео, Табло и т.д.)
 * Нижняя часть: дашборд со статистикой по всем объектам.
 * Неактивные чекбоксы – чёрные, полупрозрачные (opacity 0.6).
 * Все элементы растянуты на всю ширину правого окна.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    // Список датчиков (колонок)
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

        // Левая панель с деревом ТС
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Доп. Оборудование',
            iconCls: 'fa fa-microchip',
            width: 320,
            layout: 'fit',
            items: [me.createVehicleTree()]
        });

        // Правая панель – вертикальное разделение
        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;

        me.refreshDashboard();
    },

    // Стили: чёрные полупрозрачные неактивные элементы, полная ширина
    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            /* Контейнер правой панели – на всю ширину */
            .sensor-dashboard-container {
                background: #f9f9f9 !important;
                width: 100% !important;
            }
            /* Верхний контейнер с чекбоксами – flex, перенос, растяжение */
            .sensors-hbox-container {
                display: flex !important;
                flex-wrap: wrap !important;
                justify-content: flex-start !important;
                align-items: center !important;
                background: #ffffff !important;
                padding: 12px 15px !important;
                border-bottom: 2px solid #e0e4e8 !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            /* Каждый чекбокс – автоматическая ширина, отступы */
            .sensor-checkbox-item {
                flex: 0 0 auto !important;
                margin: 5px 15px 5px 0 !important;
                background: transparent !important;
                position: relative;
            }
            /* Активные и неактивные чекбоксы – всегда чёрный текст */
            .sensor-dashboard-checkbox .x-form-cb-label {
                color: #000000 !important;
                font-weight: 600 !important;
                font-size: 13px !important;
                margin-left: 6px !important;
            }
            .sensor-dashboard-checkbox .x-form-checkbox {
                transform: scale(1.15) !important;
                margin-right: 4px !important;
            }
            /* НЕАКТИВНЫЕ (disabled) – чёрные и полупрозрачные */
            .sensor-dashboard-checkbox .x-form-field:disabled + .x-form-cb-label {
                color: #000000 !important;
                opacity: 0.6 !important;
            }
            .sensor-dashboard-checkbox .x-form-checkbox:disabled {
                opacity: 0.6 !important;
            }
            /* Иконка замка для неактивных полей */
            .sensor-checkbox-item.locked .x-form-cb-label::after {
                content: " 🔒";
                font-size: 11px;
                opacity: 0.6;
                margin-left: 4px;
            }
            /* Панель дашборда */
            .dashboard-panel {
                background: #ffffff !important;
                margin: 15px 10px 10px 10px !important;
                border-radius: 6px !important;
                box-shadow: 0 1px 4px rgba(0,0,0,0.1) !important;
                width: auto !important;
            }
            .dashboard-grid .x-grid-cell {
                font-size: 13px !important;
                padding: 6px 4px !important;
                color: #000000 !important;
            }
            .dashboard-grid .x-grid-header {
                background: #eef2f7 !important;
                font-weight: bold !important;
                color: #1e466e !important;
            }
            .x-toolbar {
                background: #f0f2f5 !important;
                border-bottom: 1px solid #d5d8dc !important;
            }
            .x-btn {
                font-weight: 600 !important;
                color: #000000 !important;
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

    // Правая панель: верх – чекбоксы, низ – дашборд
    createMainPanel: function () {
        var me = this;

        // Контейнер для чекбоксов (верх)
        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            layout: {
                type: 'hbox',
                align: 'middle',
                pack: 'start',
                wrap: true
            },
            cls: 'sensors-hbox-container',
            defaults: { margin: '0 15 5 0' }
        });

        // Хранилище для дашборда
        var dashboardStore = Ext.create('Ext.data.Store', {
            fields: ['sensor', 'totalVehicles', 'enabledCount', 'percentage'],
            data: []
        });

        // Грид дашборда (без скролла, все строки)
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
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', style: 'font-weight: bold; font-size: 14px; color: #000000;' },
                '->',
                { text: 'Редактировать', handler: function () { me.setSensorsEditable(true); } },
                { text: 'Применить', handler: function () { me.saveCurrentConfig(); me.setSensorsEditable(false); me.refreshDashboard(); } }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            tbar: tbar,
            items: [
                fieldContainer,      // верхняя часть – чекбоксы
                { xtype: 'component', height: 10 }, // небольшой отступ
                dashboardPanel       // нижняя часть – дашборд
            ],
            cls: 'sensor-dashboard-container'
        });

        mainPanel.sensorsContainer = fieldContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.dashboardGrid = dashboardGrid;

        return mainPanel;
    },

    // Загрузка настроек для выбранного ТС
    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        var container = me.mainPanel.sensorsContainer;
        var label = me.mainPanel.vehicleLabel;

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
                disabled: true,
                cls: 'sensor-dashboard-checkbox'
            });
            // Оборачиваем для добавления класса замка
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
        var container = this.mainPanel.sensorsContainer;
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

        var container = me.mainPanel.sensorsContainer;
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

    // Обновление дашборда по всем ТС
    refreshDashboard: function () {
        var me = this;
        var store = me.mainPanel.dashboardStore;
        if (!store) return;

        var allVehicles = [];
        var tree = me.navTab.items.get(0);
        var rootNode = tree.getRootNode();
        me.collectVehicles(rootNode, allVehicles);
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
        var mainPanel = this.mainPanel;
        mainPanel.sensorsContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
