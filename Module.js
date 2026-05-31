/**
 * Extension for PILOT – Доп. Оборудование
 * Левая панель: поиск по ТС + фильтр по датчику.
 * Правая панель: чекбоксы всегда активны, кнопка «Применить».
 * Под таблицей статистики – уменьшенная столбчатая диаграмма (Highcharts) с разными цветами для каждого датчика.
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

    // Цветовая палитра для датчиков
    chartColors: [
        '#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c',
        '#1a9641', '#fd8d3c', '#f4c542', '#9467bd'
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
            .sensors-panel {
                margin: 15px 10px 0 10px;
                background: #ffffff;
                border: 1px solid #e0e4e8;
                border-radius: 4px;
                overflow: hidden;
            }
            .sensors-hbox-container {
                padding: 12px 15px;
                background: transparent;
            }
            .sensor-checkbox-item {
                display: inline-block;
                margin: 5px 15px 5px 0;
                white-space: nowrap;
            }
            .x-form-cb-label {
                color: #000000 !important;
                font-weight: normal !important;
            }
            .x-form-checkbox {
                opacity: 1 !important;
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
            .vehicle-search-field, .sensor-filter-combo {
                margin: 5px;
                width: 180px;
            }
            .chart-container {
                margin: 0 10px 15px 10px;
                background: #ffffff;
                border: 1px solid #e0e4e8;
                border-radius: 4px;
                padding: 8px;
                height: 240px;
            }
            .chart-container .highcharts-container {
                width: 100% !important;
                height: 100% !important;
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
        if (grid && grid.getSelectionModel) {
            grid.getSelectionModel().select(record);
        }
    },

    getSelectedVehicleFromGrid: function() {
        var grid = this.navTab.items.get(0);
        if (grid && grid.getSelectionModel) {
            var selected = grid.getSelectionModel().getSelection();
            if (selected && selected.length) {
                return {
                    vehid: selected[0].get('vehid'),
                    name: selected[0].get('name')
                };
            }
        }
        return null;
    },

    createMainPanel: function () {
        var me = this;

        // Контейнер чекбоксов
        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'sensorsContainer',
            layout: { type: 'hbox', align: 'middle', pack: 'start', wrap: true },
            cls: 'sensors-hbox-container'
        });

        var sensorsPanel = Ext.create('Ext.panel.Panel', {
            cls: 'sensors-panel',
            layout: 'fit',
            items: [fieldContainer]
        });

        // Таблица статистики
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

        // Контейнер для диаграммы (уменьшен)
        var chartContainer = Ext.create('Ext.container.Container', {
            cls: 'chart-container',
            itemId: 'chartContainer',
            html: '<div id="sensorChart" style="width:100%; height:100%;"></div>'
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', style: 'font-weight: bold; font-size: 13px;' },
                '->',
                { text: 'Применить', handler: function () { me.saveCurrentConfig(); me.refreshDashboard(); } }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: { type: 'vbox', align: 'stretch' },
            tbar: tbar,
            items: [
                sensorsPanel,
                { xtype: 'component', height: 8 },
                dashboardPanel,
                { xtype: 'component', height: 8 },
                chartContainer
            ]
        });

        mainPanel.sensorsContainer = fieldContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.dashboardGrid = dashboardGrid;
        mainPanel.chartContainer = chartContainer;

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
                disabled: false,
                labelCls: 'x-form-cb-label'
            });
            var wrapper = Ext.create('Ext.container.Container', {
                cls: 'sensor-checkbox-item',
                items: [checkbox],
                margin: '0 15 0 0'
            });
            container.add(wrapper);
        });

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.refreshDashboard();
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
        me.applyVehicleFilters();
    },

    refreshDashboard: function () {
        var me = this;
        var store = me.mainPanel.dashboardStore;
        if (!store) return;

        var fullStore = me.vehicleFullStore;
        var allVehicles = [];
        if (fullStore) {
            fullStore.each(function(record) {
                allVehicles.push(record.get('vehid'));
            });
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
        var categories = [];
        var seriesData = [];
        Ext.each(me.sensors, function(sensor, idx) {
            var enabled = totals[sensor.name];
            var percent = totalVehicleCount ? Math.round((enabled / totalVehicleCount) * 100) : 0;
            data.push({
                sensor: sensor.label,
                totalVehicles: totalVehicleCount,
                enabledCount: enabled,
                percentage: percent
            });
            categories.push(sensor.label);
            seriesData.push(enabled);
        });
        store.loadData(data);

        // Отрисовка диаграммы с индивидуальными цветами
        me.renderChart(categories, seriesData, totalVehicleCount);
    },

    renderChart: function (categories, seriesData, totalVehicleCount) {
        var me = this;
        var container = me.mainPanel.chartContainer;
        if (!container) return;

        var el = document.getElementById('sensorChart');
        if (!el) {
            container.update('<div id="sensorChart" style="width:100%; height:100%;"></div>');
            el = document.getElementById('sensorChart');
        }
        if (!el) return;

        if (typeof Highcharts === 'undefined') {
            el.innerHTML = '<div style="padding:20px; text-align:center;">Highcharts не загружен</div>';
            return;
        }

        if (me.chart) {
            me.chart.destroy();
        }

        // Формируем серию с индивидуальными цветами для каждого столбца
        var columnData = [];
        for (var i = 0; i < seriesData.length; i++) {
            columnData.push({
                y: seriesData[i],
                color: me.chartColors[i % me.chartColors.length]
            });
        }

        me.chart = Highcharts.chart(el, {
            chart: { type: 'column', height: 210, width: null },
            title: { text: 'Количество ТС с включённым датчиком', style: { fontSize: '12px' } },
            subtitle: { text: 'Всего ТС: ' + totalVehicleCount, style: { fontSize: '11px' } },
            xAxis: { categories: categories, labels: { rotation: -30, style: { fontSize: '10px' } } },
            yAxis: { title: { text: 'ТС' }, min: 0, gridLineWidth: 0 },
            tooltip: { pointFormat: '<b>{point.y}</b> из ' + totalVehicleCount + ' ТС' },
            plotOptions: { column: { dataLabels: { enabled: true, format: '{y}', style: { fontSize: '10px' } } } },
            series: [{
                name: 'Включено',
                data: columnData,
                colorByPoint: false,
                showInLegend: false
            }],
            credits: { enabled: false },
            legend: { enabled: false }
        });
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        if (mainPanel && mainPanel.sensorsContainer) {
            mainPanel.sensorsContainer.removeAll();
            mainPanel.vehicleLabel.setText('ТС не выбрано');
        }
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
