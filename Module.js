/**
 * Extension for PILOT – Доп. Оборудование
 * Левая панель: список ТС с колонкой «Датчики» и иконками активных датчиков.
 * Правая панель: таблица датчиков (Ext.grid.Panel) с контекстным меню.
 * Сохранение в localStorage, фильтрация, диаграмма Highcharts.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    sensors: [
        { name: 'aog', label: 'АОГ', icon: 'bi-broadcast' },
        { name: 'video', label: 'Видео', icon: 'bi-camera-video' },
        { name: 'tablo', label: 'Табло', icon: 'bi-grid-3x2-gap' },
        { name: 'voice', label: 'Голос', icon: 'bi-mic' },
        { name: 'tf', label: 'ТФ', icon: 'bi-toggle-on' },
        { name: 'kpp', label: 'BLE', icon: 'bi-toggle-on' },
        { name: 'thg', label: 'ТХГ', icon: 'bi-speedometer2' },
        { name: 'dut', label: 'ДУТ', icon: 'bi-align-top' },
        { name: 'temp_sensor', label: 'Датчик t', icon: 'bi-thermometer-snow' }
    ],

    initModule: function () {
        var me = this;
        me.addCustomStyles();

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Доп. Оборудование',
            iconCls: 'fa fa-microchip',
            width: 320,
            layout: 'fit',
            items: [me.createVehicleList()]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;

        me.resizeObserver = new ResizeObserver(function() {
            if (me.chart) me.chart.reflow();
        });
        if (mainPanel.body) {
            me.resizeObserver.observe(mainPanel.body.dom);
        }

        me.refreshDashboard();
    },

    addCustomStyles: function () {
        var styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.innerHTML = `
            .sensors-grid-panel {
                margin: 15px 10px 0 10px;
                border: 1px solid #e0e4e8;
                border-radius: 4px;
                background: #ffffff;
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
            .dashboard-grid .x-grid-row {
                cursor: pointer;
            }
            .dashboard-grid .x-grid-row:hover {
                background: #f0f7ff;
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
                padding: 5px;
                height: 450px;
                width: auto;
            }
            #sensorChart {
                width: 100%;
                height: 100%;
            }
            /* стили для иконок в левом гриде */
            .sensor-icons i {
                font-size: 14px;
                margin: 0 2px;
                color: #2c7bb6;
                vertical-align: middle;
            }
        `;
        document.head.appendChild(styleEl);
        // Подключаем Bootstrap Icons, если ещё не загружены
        if (!document.querySelector('link[href*="bootstrap-icons"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
            document.head.appendChild(link);
        }
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
                                    vehicles.push({ vehid: node.vehid, name: node.name });
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

        // Store для отображения с дополнительным полем 'iconsHtml'
        var displayStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name', 'iconsHtml'],
            data: []
        });

        var searchField = Ext.create('Ext.form.field.Text', {
            cls: 'vehicle-search-field',
            emptyText: 'Поиск ТС...',
            enableKeyEvents: true,
            triggers: {
                clear: { cls: 'x-form-clear-trigger', handler: function() { searchField.reset(); me.applyVehicleFilters(); } }
            },
            listeners: { keyup: function() { me.applyVehicleFilters(); } }
        });

        var sensorFilterCombo = Ext.create('Ext.form.field.ComboBox', {
            cls: 'sensor-filter-combo',
            emptyText: 'Фильтр по датчику',
            store: Ext.create('Ext.data.Store', {
                fields: ['value', 'label'],
                data: [{ value: null, label: 'Все датчики' }].concat(Ext.Array.map(me.sensors, function(s) {
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
            store: displayStore,
            columns: [
                { text: 'ТС', dataIndex: 'name', flex: 2 },
                { 
                    text: 'Датчики', 
                    dataIndex: 'iconsHtml', 
                    flex: 1,
                    renderer: function(value) {
                        return value ? value : '';
                    }
                }
            ],
            tbar: [searchField, sensorFilterCombo],
            listeners: {
                selectionchange: function(selModel, selected) {
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
        me.vehicleDisplayStore = displayStore;
        me.searchField = searchField;
        me.sensorFilterCombo = sensorFilterCombo;

        // Обновление иконок для всех ТС (при загрузке и после изменений)
        function updateIconsForAllVehicles() {
            var allVehicles = [];
            fullStore.each(function(rec) {
                allVehicles.push({ vehid: rec.get('vehid'), name: rec.get('name') });
            });
            var recordsWithIcons = [];
            Ext.each(allVehicles, function(vehicle) {
                var storageKey = 'sensor_dashboard_' + vehicle.vehid;
                var saved = localStorage.getItem(storageKey);
                var values = saved ? JSON.parse(saved) : {};
                var iconsHtml = me.getIconsHtml(values);
                recordsWithIcons.push({
                    vehid: vehicle.vehid,
                    name: vehicle.name,
                    iconsHtml: iconsHtml
                });
            });
            // Сохраняем все записи в displayStore (для фильтрации используется отдельно)
            displayStore.loadData(recordsWithIcons);
            // Применяем текущие фильтры
            me.applyVehicleFilters();
        }

        fullStore.on('load', function() {
            updateIconsForAllVehicles();
            // После загрузки выбираем первый ТС в отфильтрованном списке
            var firstRecord = displayStore.getAt(0);
            if (firstRecord) grid.getSelectionModel().select(firstRecord);
        });

        // Функция для вызова обновления иконок извне (после сохранения настроек)
        me.updateVehicleIcons = function() {
            updateIconsForAllVehicles();
        };

        return grid;
    },

    getIconsHtml: function(values) {
        var me = this;
        var icons = [];
        Ext.each(me.sensors, function(sensor) {
            if (values[sensor.name] === 'yes') {
                icons.push('<i class="bi ' + sensor.icon + '" title="' + sensor.label + '"></i>');
            }
        });
        return icons.length ? '<div class="sensor-icons">' + icons.join(' ') + '</div>' : '';
    },

    applyVehicleFilters: function() {
        var me = this;
        var fullStore = me.vehicleFullStore;
        var displayStore = me.vehicleDisplayStore;
        if (!fullStore || !displayStore) return;

        var searchValue = me.searchField ? me.searchField.getValue() : '';
        var selectedSensor = me.sensorFilterCombo ? me.sensorFilterCombo.getValue() : null;

        var filtered = [];
        displayStore.each(function(record) {
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

        displayStore.loadData(filtered);

        if (displayStore.getCount() === 0) {
            me.clearConfigForm();
            return;
        }

        var selectedRecord = me.getSelectedVehicleFromGrid();
        if (!selectedRecord) {
            var first = displayStore.getAt(0);
            if (first) me.selectVehicleInGrid(first);
        } else {
            var exists = false;
            displayStore.each(function(rec) {
                if (rec.get('vehid') === selectedRecord.vehid) exists = true;
            });
            if (!exists && displayStore.getCount() > 0) {
                me.selectVehicleInGrid(displayStore.getAt(0));
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

        var sensorsStore = Ext.create('Ext.data.Store', {
            fields: me.sensors.map(function(s) { return s.name; }),
            data: [{}]
        });

        function createMenuForSensor(sensor) {
            return Ext.create('Ext.menu.Menu', {
                items: [
                    {
                        text: 'Выбрать все',
                        handler: function() { me.setAllCheckboxesForCurrentVehicle(sensor.name, true); }
                    },
                    {
                        text: 'Снять все',
                        handler: function() { me.setAllCheckboxesForCurrentVehicle(sensor.name, false); }
                    },
                    {
                        text: 'Фильтровать по этому датчику',
                        handler: function() {
                            if (me.sensorFilterCombo) {
                                me.sensorFilterCombo.setValue(sensor.name);
                                me.applyVehicleFilters();
                            }
                        }
                    }
                ]
            });
        }

        var columns = [];
        Ext.each(me.sensors, function(sensor) {
            columns.push({
                text: sensor.label,
                dataIndex: sensor.name,
                flex: 1,
                menu: createMenuForSensor(sensor),
                renderer: function(value) {
                    var checked = (value === 'yes');
                    return '<input type="checkbox" ' + (checked ? 'checked' : '') + ' style="pointer-events:none;">';
                },
                field: { xtype: 'checkboxfield' }
            });
        });

        var sensorsGrid = Ext.create('Ext.grid.Panel', {
            cls: 'sensors-grid-panel',
            store: sensorsStore,
            columns: columns,
            height: 80,
            viewConfig: { stripeRows: false, enableTextSelection: false },
            selType: 'cellmodel',
            plugins: [Ext.create('Ext.grid.plugin.CellEditing', { clicksToEdit: 1 })],
            listeners: {
                edit: function(editor, context) {
                    var newValue = context.value ? 'yes' : 'no';
                    var record = context.record;
                    record.set(context.field, newValue);
                }
            }
        });

        var dashboardStore = Ext.create('Ext.data.Store', {
            fields: ['sensorLabel', 'sensorName', 'totalVehicles', 'enabledCount', 'percentage'],
            data: []
        });

        var dashboardGrid = Ext.create('Ext.grid.Panel', {
            store: dashboardStore,
            cls: 'dashboard-grid',
            autoHeight: true,
            scrollable: false,
            columns: [
                { text: 'Датчик', dataIndex: 'sensorLabel', flex: 2 },
                { text: 'Всего ТС', dataIndex: 'totalVehicles', flex: 1 },
                { text: 'Включено', dataIndex: 'enabledCount', flex: 1 },
                { text: '%', dataIndex: 'percentage', flex: 1, renderer: function(v) { return v + ' %'; } }
            ],
            viewConfig: { stripeRows: true, emptyText: 'Нет данных' },
            listeners: {
                itemclick: function(view, record) {
                    var sensorName = record.get('sensorName');
                    if (sensorName && me.sensorFilterCombo) {
                        me.sensorFilterCombo.setValue(sensorName);
                        me.applyVehicleFilters();
                    }
                }
            }
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

        var chartContainer = Ext.create('Ext.container.Container', {
            cls: 'chart-container',
            height: 450,
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
                sensorsGrid,
                { xtype: 'component', height: 10 },
                dashboardPanel,
                { xtype: 'component', height: 10 },
                chartContainer
            ],
            autoScroll: true
        });

        mainPanel.sensorsGrid = sensorsGrid;
        mainPanel.sensorsStore = sensorsStore;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.dashboardStore = dashboardStore;
        mainPanel.dashboardGrid = dashboardGrid;
        mainPanel.chartContainer = chartContainer;

        return mainPanel;
    },

    setAllCheckboxesForCurrentVehicle: function(sensorName, value) {
        var me = this;
        if (!me.currentVehid) return;
        var record = me.mainPanel.sensorsStore.getAt(0);
        if (record) {
            record.set(sensorName, value ? 'yes' : 'no');
        }
    },

    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        var label = me.mainPanel.vehicleLabel;
        label.setText(vehicleName);

        var storageKey = 'sensor_dashboard_' + vehid;
        var saved = localStorage.getItem(storageKey);
        var values = saved ? JSON.parse(saved) : {};

        var recordData = {};
        Ext.each(me.sensors, function(sensor) {
            recordData[sensor.name] = (values[sensor.name] === 'yes') ? 'yes' : 'no';
        });
        me.mainPanel.sensorsStore.loadData([recordData]);

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
        me.refreshDashboard();
    },

    saveCurrentConfig: function () {
        var me = this;
        if (!me.currentVehid) return;

        var record = me.mainPanel.sensorsStore.getAt(0);
        if (!record) return;

        var values = {};
        Ext.each(me.sensors, function(sensor) {
            values[sensor.name] = record.get(sensor.name) === 'yes' ? 'yes' : 'no';
        });

        var storageKey = 'sensor_dashboard_' + me.currentVehid;
        localStorage.setItem(storageKey, JSON.stringify(values));
        Ext.Msg.alert('Сохранено', 'Настройки сохранены');
        
        // Обновляем иконки в левом списке
        if (me.updateVehicleIcons) me.updateVehicleIcons();
        me.applyVehicleFilters();
        me.refreshDashboard();
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

        var data = [], categories = [], seriesData = [];
        Ext.each(me.sensors, function(sensor) {
            var enabled = totals[sensor.name];
            var percent = totalVehicleCount ? Math.round((enabled / totalVehicleCount) * 100) : 0;
            data.push({
                sensorLabel: sensor.label,
                sensorName: sensor.name,
                totalVehicles: totalVehicleCount,
                enabledCount: enabled,
                percentage: percent
            });
            categories.push(sensor.label);
            seriesData.push(enabled);
        });
        store.loadData(data);
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
        if (me.chart) me.chart.destroy();

        var colors = ['#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
                      '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1'];

        me.chart = Highcharts.chart(el, {
            chart: { type: 'column', backgroundColor: 'transparent', width: null },
            title: { text: 'Количество ТС с включённым датчиком', style: { fontSize: '16px', fontWeight: 'bold' } },
            subtitle: { text: 'Всего ТС: ' + totalVehicleCount, style: { fontSize: '13px', color: '#555' } },
            accessibility: { enabled: false },
            xAxis: { categories: categories, title: { text: 'Датчики' }, labels: { rotation: -45 } },
            yAxis: { title: { text: 'Количество ТС' }, min: 0, allowDecimals: false },
            tooltip: { headerFormat: '<b>{point.x}</b><br/>', pointFormat: '{point.y} из {point.total} ТС ({point.percentage:.1f}%)' },
            plotOptions: { column: { colorByPoint: true, dataLabels: { enabled: true, format: '{point.y}' }, pointWidth: 55 } },
            colors: colors,
            series: [{ name: 'Включено', data: seriesData }],
            credits: { enabled: false },
            exporting: { enabled: false },
            navigation: { buttonOptions: { enabled: false } },
            legend: { enabled: false },
            responsive: { rules: [{ condition: { maxWidth: 600 }, chartOptions: { xAxis: { labels: { rotation: -90 } } } }] }
        });
    },

    clearConfigForm: function () {
        var store = this.mainPanel.sensorsStore;
        if (store) store.loadData([{}]);
        if (this.mainPanel) this.mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
        this.refreshDashboard();
    }
});
