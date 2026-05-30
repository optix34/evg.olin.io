// PILOT Extension: Sensor Events Analyzer
// Анализ срабатываний датчиков объектов
Ext.define('Store.sensor_events_analyzer.Module', {
    extend: 'Ext.Component',

    // Хранилище для маркеров, созданных расширением (чтобы очищать при новых запросах)
    currentMarkers: [],
    mainPanelRef: null, // ссылка на главную панель

    initModule: function () {
        var me = this;

        // ========== 1. Левая навигационная панель (дерево объектов) ==========
        var navTree = Ext.create('Ext.tree.Panel', {
            title: l('Objects'),
            rootVisible: false,
            useArrows: true,
            store: this.createTreeStore(),
            columns: [{
                xtype: 'treecolumn',
                text: l('Vehicle'),
                dataIndex: 'text',
                flex: 2
            }, {
                text: l('Model'),
                dataIndex: 'model',
                flex: 1,
                renderer: function (v) { return v || '—'; }
            }, {
                text: l('Year'),
                dataIndex: 'year',
                flex: 0.5,
                renderer: function (v) { return v || '—'; }
            }],
            listeners: {
                selectionchange: function (selModel, selected) {
                    var record = selected && selected[0];
                    if (record && record.get('vehid')) {
                        me.onVehicleSelected(record);
                    }
                },
                scope: me
            }
        });

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Sensor Events Analyzer'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            items: [navTree]
        });

        // ========== 2. Основная панель (mapframe) ==========
        var mainPanel = this.createMainPanel();
        this.mainPanelRef = mainPanel; // сохраняем ссылку

        // Связываем навигацию с основной панелью (требование AI_SPECS)
        navTab.map_frame = mainPanel;

        // Добавляем компоненты в интерфейс PILOT
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);
    },

    // Создаёт TreeStore для загрузки реальных объектов из /ax/tree.php
    createTreeStore: function () {
        var me = this; // сохраняем ссылку на модуль для использования внутри transform
        return Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: {
                    type: 'json',
                    rootProperty: 'children', // адаптируем ответ в древовидную структуру
                    transform: function (data) {
                        // PILOT возвращает массив групп верхнего уровня
                        // Превращаем его в формат для Ext.tree.Panel
                        return me.transformTreeData(data);
                    }
                }
            },
            root: {
                text: l('All objects'),
                expanded: true
            },
            autoLoad: true
        });
    },

    // Рекурсивно преобразует ответ /ax/tree.php в узлы дерева
    transformTreeData: function (items) {
        var result = [];
        if (!Ext.isArray(items)) return result;

        var me = this; // для рекурсивного вызова
        Ext.each(items, function (item) {
            var node = {
                text: item.name || item.text,
                vehid: item.vehid || null,
                model: item.model || null,
                year: item.year || null,
                leaf: false,
                children: []
            };

            // Если это транспортное средство (есть vehid) и нет дочерних элементов
            if (item.vehid && !item.children) {
                node.leaf = true;
                node.children = null;
            } else if (item.children && item.children.length) {
                node.children = me.transformTreeData(item.children);
                // Если после преобразования детей нет, считаем листом
                if (!node.children.length) node.leaf = true;
            } else {
                node.leaf = true;
            }

            result.push(node);
        });
        return result;
    },

    // Создаёт главную панель с тулбаром, табами статистики/событий и сырым JSON
    createMainPanel: function () {
        var me = this;

        // ---- Тулбар с настройками API URL ----
        var storedUrl = localStorage.getItem('sensor_events_api_url') || '/ax/sensor_events.php?vehid=';
        var apiUrlField = Ext.create('Ext.form.field.Text', {
            fieldLabel: l('Events URL'),
            value: storedUrl,
            width: 400,
            labelWidth: 70,
            allowBlank: false,
            emptyText: '/ax/sensor_events.php?vehid='
        });

        var statusLabel = Ext.create('Ext.form.field.Display', {
            value: l('Ready'),
            style: 'margin-left: 10px; color: #2c3e50;'
        });

        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                apiUrlField,
                {
                    text: l('Save URL'),
                    iconCls: 'fa fa-save',
                    handler: function () {
                        var url = apiUrlField.getValue();
                        if (url) {
                            localStorage.setItem('sensor_events_api_url', url);
                            statusLabel.setValue(l('URL saved'));
                            Ext.defer(function () { statusLabel.setValue(l('Ready')); }, 2000);
                        }
                    }
                },
                {
                    text: l('Reload events'),
                    iconCls: 'fa fa-refresh',
                    handler: function () {
                        var selected = me.getSelectedVehicleRecord();
                        if (selected) {
                            me.loadSensorEvents(selected, statusLabel);
                        } else {
                            statusLabel.setValue(l('No vehicle selected'));
                        }
                    }
                },
                '->',
                statusLabel
            ]
        });

        // ---- Таб-панель: Статистика и События ----
        var statsContainer = Ext.create('Ext.container.Container', {
            layout: 'fit',
            items: [{
                xtype: 'box',
                autoEl: 'div',
                cls: 'sensor-stats-content',
                html: '<div style="padding: 10px;">' + l('Select a vehicle to load events') + '</div>'
            }]
        });

        var eventsGrid = Ext.create('Ext.grid.Panel', {
            title: l('Events list'),
            store: Ext.create('Ext.data.Store', {
                fields: ['timestamp', 'sensor_name', 'sensor_type', 'value', 'lat', 'lon', 'event_id']
            }),
            columns: [
                { text: l('Timestamp'), dataIndex: 'timestamp', flex: 2 },
                { text: l('Sensor'), dataIndex: 'sensor_name', flex: 1.5 },
                { text: l('Type'), dataIndex: 'sensor_type', flex: 1 },
                { text: l('Value'), dataIndex: 'value', flex: 1 },
                { text: l('Lat'), dataIndex: 'lat', flex: 0.8, renderer: function(v) { return v ? v.toFixed(5) : '—'; } },
                { text: l('Lon'), dataIndex: 'lon', flex: 0.8, renderer: function(v) { return v ? v.toFixed(5) : '—'; } },
                {
                    text: l('Map'),
                    flex: 0.6,
                    xtype: 'actioncolumn',
                    iconCls: 'fa fa-map-marker',
                    handler: function (grid, rowIndex, colIndex, item, e, record) {
                        me.showEventOnMap(record);
                    }
                }
            ],
            listeners: {
                itemclick: function (view, record) {
                    me.showEventOnMap(record);
                }
            }
        });

        var tabPanel = Ext.create('Ext.tab.Panel', {
            region: 'center',
            items: [{
                title: l('Statistics'),
                layout: 'fit',
                items: [statsContainer]
            }, {
                title: l('Events'),
                layout: 'fit',
                items: [eventsGrid]
            }]
        });

        // ---- Южная панель (сырой JSON, свернут) ----
        var rawJsonArea = Ext.create('Ext.form.field.TextArea', {
            fieldLabel: l('Raw JSON response'),
            labelAlign: 'top',
            readOnly: true,
            height: 200,
            style: 'font-family: monospace;'
        });

        var southPanel = Ext.create('Ext.panel.Panel', {
            region: 'south',
            title: l('Raw Decode'),
            collapsible: true,
            collapsed: true,
            layout: 'fit',
            height: 250,
            items: [rawJsonArea]
        });

        // Главная панель с border-раскладкой
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            items: [
                { region: 'north', height: 50, items: [toolbar], border: false },
                tabPanel,
                southPanel
            ]
        });

        // Сохраняем ссылки на внутренние компоненты, чтобы использовать в методах
        mainPanel.statsContainer = statsContainer;
        mainPanel.eventsGrid = eventsGrid;
        mainPanel.rawJsonArea = rawJsonArea;
        mainPanel.toolbarStatus = statusLabel;

        // Также сохраняем текущий выбранный транспорт
        mainPanel.currentVehicle = null;

        return mainPanel;
    },

    // Возвращает запись выбранного в дереве транспортного средства (храним в mainPanel)
    getSelectedVehicleRecord: function () {
        var mainPanel = this.mainPanelRef;
        return mainPanel ? mainPanel.currentVehicle : null;
    },

    // Вызывается при выборе транспорта в дереве
    onVehicleSelected: function (record) {
        var mainPanel = this.mainPanelRef;
        if (!mainPanel) return;

        mainPanel.currentVehicle = record;
        var statusLabel = mainPanel.toolbarStatus;
        statusLabel.setValue(l('Loading events...'));
        this.loadSensorEvents(record, statusLabel);
    },

    // Загрузка событий датчиков с настраиваемого API
    loadSensorEvents: function (vehicleRecord, statusLabel) {
        var me = this;
        var vehid = vehicleRecord.get('vehid');
        if (!vehid) {
            statusLabel.setValue(l('Vehicle ID not found'));
            return;
        }

        var apiBase = localStorage.getItem('sensor_events_api_url');
        if (!apiBase) {
            statusLabel.setValue(l('Please configure Events URL in the toolbar'));
            return;
        }

        // Добавляем параметр vehid (в URL может уже быть вопросительный знак)
        var url = apiBase;
        if (url.indexOf('?') === -1) {
            url += '?vehid=' + vehid;
        } else {
            url += '&vehid=' + vehid;
        }

        Ext.Ajax.request({
            url: url,
            method: 'GET',
            timeout: 15000,
            success: function (response) {
                try {
                    var data = Ext.decode(response.responseText);
                    me.processEvents(data, vehicleRecord);
                    statusLabel.setValue(l('Loaded ') + (data.length || 0) + ' ' + l('events'));
                } catch (e) {
                    statusLabel.setValue(l('Invalid JSON response'));
                    me.clearEventsDisplay();
                }
            },
            failure: function (response) {
                var msg = l('Failed to load events: ') + response.status;
                statusLabel.setValue(msg);
                me.clearEventsDisplay();
            }
        });
    },

    // Обработка полученных событий: обновление статистики, таблицы, сырого JSON и карты
    processEvents: function (eventsArray, vehicleRecord) {
        var mainPanel = this.mainPanelRef;
        if (!mainPanel) return;

        var statsContainer = mainPanel.statsContainer;
        var eventsGrid = mainPanel.eventsGrid;
        var rawArea = mainPanel.rawJsonArea;

        // Очищаем старые маркеры с карты
        this.clearMarkers();

        // Если нет событий
        if (!eventsArray || !eventsArray.length) {
            statsContainer.removeAll();
            statsContainer.add({
                xtype: 'box',
                autoEl: 'div',
                html: '<div style="padding: 10px;">' + l('No sensor events found for this vehicle') + '</div>'
            });
            eventsGrid.getStore().removeAll();
            rawArea.setValue('');
            return;
        }

        // Заполняем таблицу событий
        var store = eventsGrid.getStore();
        store.loadData(eventsArray);

        // Выводим сырой JSON
        rawArea.setValue(JSON.stringify(eventsArray, null, 2));

        // ========== Статистика ==========
        var total = eventsArray.length;
        var sensorTypeCount = {};
        var sensorNameCount = {};

        Ext.each(eventsArray, function (ev) {
            var type = ev.sensor_type || 'unknown';
            sensorTypeCount[type] = (sensorTypeCount[type] || 0) + 1;
            var name = ev.sensor_name || 'unknown';
            sensorNameCount[name] = (sensorNameCount[name] || 0) + 1;
        });

        // Определяем самый активный датчик
        var mostActiveSensor = '';
        var maxCount = 0;
        for (var name in sensorNameCount) {
            if (sensorNameCount[name] > maxCount) {
                maxCount = sensorNameCount[name];
                mostActiveSensor = name;
            }
        }

        // Формируем HTML для статистики
        var statsHtml = '<div style="padding: 10px;">';
        statsHtml += '<h3>' + l('Total events') + ': ' + total + '</h3>';
        statsHtml += '<h4>' + l('Breakdown by sensor type') + ':</h4><ul>';
        for (var t in sensorTypeCount) {
            statsHtml += '<li><b>' + Ext.String.htmlEncode(t) + '</b>: ' + sensorTypeCount[t] + '</li>';
        }
        statsHtml += '</ul>';
        statsHtml += '<p><b>' + l('Most active sensor') + ':</b> ' + Ext.String.htmlEncode(mostActiveSensor) + ' (' + maxCount + ')</p>';

        // Если доступен Highcharts, рисуем красивую диаграмму
        if (window.Highcharts) {
            // Создадим контейнер для графика
            var chartContainer = Ext.create('Ext.container.Container', {
                height: 300,
                html: '<div id="sensor-chart" style="height:280px;"></div>'
            });
            statsContainer.removeAll();
            statsContainer.add({
                xtype: 'box',
                autoEl: 'div',
                html: statsHtml
            });
            statsContainer.add(chartContainer);

            // Ждём рендера контейнера, потом рисуем
            setTimeout(function () {
                var categories = [];
                var seriesData = [];
                for (var ct in sensorTypeCount) {
                    categories.push(ct);
                    seriesData.push(sensorTypeCount[ct]);
                }
                window.Highcharts.chart('sensor-chart', {
                    chart: { type: 'column' },
                    title: { text: l('Events by sensor type') },
                    xAxis: { categories: categories, title: { text: l('Sensor type') } },
                    yAxis: { title: { text: l('Count') } },
                    series: [{ name: l('Events'), data: seriesData }]
                });
            }, 100);
        } else {
            statsContainer.removeAll();
            statsContainer.add({
                xtype: 'box',
                autoEl: 'div',
                html: statsHtml
            });
        }
    },

    // Отображение одного события на карте
    showEventOnMap: function (eventRecord) {
        var lat = eventRecord.get('lat');
        var lon = eventRecord.get('lon');
        if (!lat || !lon) {
            Ext.Msg.alert(l('Info'), l('No coordinates for this event'));
            return;
        }

        // Получаем активную карту (Online/History)
        var map = window.getActiveTabMapContainer ? getActiveTabMapContainer() : (window.mapContainer || window.historyMapContainer);
        if (!map) {
            Ext.Msg.alert(l('Error'), l('Map not available'));
            return;
        }

        // Центрируем карту
        if (map.setMapCenter) {
            map.setMapCenter(lat, lon);
        } else if (map.map && map.map.setView) {
            // Leaflet fallback
            map.map.setView([lat, lon], 14);
        }

        if (map.setMapZoom) {
            map.setMapZoom(14);
        } else if (map.map && map.map.setZoom) {
            map.map.setZoom(14);
        }

        // Добавляем маркер с хинтом
        var markerId = 'event_marker_' + eventRecord.get('event_id') + '_' + new Date().getTime();
        var hint = eventRecord.get('sensor_name') + ': ' + eventRecord.get('value');
        if (map.addMarker) {
            map.addMarker({
                id: markerId,
                lat: lat,
                lon: lon,
                hint: hint
            });
            this.currentMarkers.push(markerId);
        } else {
            Ext.Msg.alert(l('Warning'), l('Map does not support addMarker method'));
        }
    },

    // Очистка всех маркеров, созданных расширением
    clearMarkers: function () {
        var map = window.getActiveTabMapContainer ? getActiveTabMapContainer() : (window.mapContainer || window.historyMapContainer);
        if (map && map.removeMarker) {
            Ext.each(this.currentMarkers, function (markerId) {
                map.removeMarker(markerId);
            });
        }
        this.currentMarkers = [];
    },

    // Сбрасывает отображение событий при ошибке
    clearEventsDisplay: function () {
        var mainPanel = this.mainPanelRef;
        if (mainPanel) {
            mainPanel.statsContainer.removeAll();
            mainPanel.statsContainer.add({
                xtype: 'box',
                autoEl: 'div',
                html: '<div style="padding: 10px;">' + l('Failed to load events') + '</div>'
            });
            mainPanel.eventsGrid.getStore().removeAll();
            mainPanel.rawJsonArea.setValue('');
        }
    }
});

// Вспомогательная функция локализации (если l() не определена в PILOT)
if (typeof l !== 'function') {
    window.l = function (key) { return key; };
}
