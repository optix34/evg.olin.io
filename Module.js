/**
 * Extension for PILOT – Доп. Оборудование
 * 
 * Полностью соответствует требованиям AI_SPECS.md:
 * - класс наследует Ext.Component
 * - точка входа initModule
 * - левая панель через Pilot.utils.LeftBarPanel (без лишних разделителей)
 * - связь navTab.map_frame = mainPanel
 * - данные ТС из /ax/tree.php
 * - все стили локализованы, не влияют на глобальный интерфейс PILOT
 * - чекбоксы активные/неактивные с чёрным текстом и полупрозрачностью
 * - нижний дашборд со статистикой по всем ТС
 * - сохранение в localStorage
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

        // Левая панель – стандартный компонент PILOT (без лишних линий)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Доп. Оборудование'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [me.createVehicleTree()]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;

        me.refreshDashboard();
    },

    // Локальные стили, не влияющие на глобальный PILOT
    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            /* Контейнер всей правой панели расширения */
            .sensor-dashboard-container {
                background: #f9f9f9;
            }
            /* Верхняя зона с чекбоксами */
            .sensor-dashboard-checkbox-zone {
                background: #ffffff;
                padding: 12px 15px;
                border-bottom: 1px solid #e0e4e8;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
            }
            /* Каждый чекбокс с отступом */
            .sensor-checkbox-item {
                margin: 5px 15px 5px 0;
                display: inline-flex;
                align-items: center;
            }
            /* Чёрный текст для чекбоксов */
            .sensor-dashboard-checkbox .x-form-cb-label {
                color: #000000 !important;
                font-weight: 600;
                font-size: 13px;
                margin-left: 6px;
            }
            /* Увеличение чекбокса */
            .sensor-dashboard-checkbox .x-form-checkbox {
                transform: scale(1.15);
                margin-right: 4px;
            }
            /* Неактивное состояние – чёрный + полупрозрачность */
            .sensor-dashboard-checkbox .x-form-field:disabled + .x-form-cb-label {
                color: #000000 !important;
                opacity: 0.6;
            }
            .sensor-dashboard-checkbox .x-form-checkbox:disabled {
                opacity: 0.6;
            }
            /* Замок у неактивных */
            .sensor-checkbox-item.locked .x-form-cb-label::after {
                content: " 🔒";
                font-size: 11px;
                opacity: 0.6;
                margin-left: 4px;
            }
            /* Панель дашборда */
            .sensor-dashboard-panel {
                background: #ffffff;
                margin: 15px 10px;
                border-radius: 6px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.1);
            }
            .sensor-dashboard-grid .x-grid-cell {
                font-size: 13px;
                padding: 6px 4px;
                color: #000000;
            }
            .sensor-dashboard-grid .x-grid-header {
                background: #eef2f7;
                font-weight: bold;
                color: #1e466e;
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
            root: { expanded: true, text: l('Все ТС') }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('ТС'),
                dataIndex: 'name',
                flex: 2
            }, {
                text: l('Метка BLE (IButton)'),
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
                text: l('Год'),
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

    createMainPanel: function () {
        var me = this;

        // Контейнер для чекбоксов (верх)
        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            cls: 'sensor-dashboard-checkbox-zone',
            layout: {
                type: 'hbox',
                align: 'middle',
                pack: 'start',
                wrap: true
            }
        });

        // Хранилище дашборда
        var dashboardStore = Ext.create('Ext.data.Store', {
            fields: ['sensor', 'totalVehicles', 'enabledCount', 'percentage'],
            data: []
        });

        var dashboardGrid = Ext.create('Ext.grid.Panel', {
            store: dashboardStore,
            cls: 'sensor-dashboard-grid',
            autoHeight: true,
            scrollable: false,
            columns: [{
                text: l('Датчик'),
                dataIndex: 'sensor',
                flex: 2
            }, {
                text: l('Всего ТС'),
                dataIndex: 'totalVehicles',
                flex: 1
            }, {
                text: l('Включено'),
                dataIndex: 'enabledCount',
                flex: 1
            }, {
                text: '%',
                dataIndex: 'percentage',
                flex: 1,
                renderer: function(v) { return v + ' %'; }
            }],
            viewConfig: { stripeRows: true, emptyText: l('Нет данных') }
        });

        var dashboardPanel = Ext.create('Ext.panel.Panel', {
            title: l('Статистика по всем объектам'),
            cls: 'sensor-dashboard-panel',
            layout: 'fit',
            items: [dashboardGrid],
            collapsible: true,
            collapsed: false,
            autoHeight: true
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: l('ТС не выбрано'), style: 'font-weight: bold; font-size: 14px; color: #000000;' },
                '->',
                { text: l('Редактировать'), handler: function () { me.setSensorsEditable(true); } },
                { text: l('Применить'), handler: function () { me.saveCurrentConfig(); me.setSensorsEditable(false); me.refreshDashboard(); } }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: { type: 'vbox', align: 'stretch' },
            tbar: tbar,
            items: [
                fieldContainer,
                { xtype: 'component', height: 10 },
                dashboardPanel
            ],
            cls: 'sensor-dashboard-container'
        });

        mainPanel.sensorsContainer = fieldContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.dashboardGrid = dashboardGrid;

        return mainPanel;
    },

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
        var me = this;
        Ext.each(me.sensors, function (sensor) {
            var checkbox = container.down('#' + sensor.name);
            if (checkbox) {
                checkbox.setDisabled(!editable);
                var wrapper = checkbox.wrapper;
                if (wrapper) {
                    if (editable) {
                        wrapper.removeCls('locked');
                    } else {
                        wrapper.addCls('locked');
                    }
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
        Ext.Msg.alert(l('Сохранено'), l('Настройки сохранены'));
    },

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
        mainPanel.vehicleLabel.setText(l('ТС не выбрано'));
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
