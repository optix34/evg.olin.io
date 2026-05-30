/**
 * Sensor Dashboard Extension for PILOT
 * Displays all sensors for selected vehicle.
 * Uses POST to /backend/ax/current_data.php
 * Left tree columns: Vehicle name, IButton label, Year.
 * Right grid: sensor description (Russian) and value.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    // Словарь для расшифровки названий датчиков
    sensorNames: {
        // Двигатель и ходовые параметры
        speed: 'Скорость',
        engine_speed: 'Обороты двигателя',
        engine_hours: 'Моточасы',
        total_mileage: 'Общий пробег',
        mileage: 'Пробег',
        odometer: 'Одометр',
        // Топливо
        fuel_level: 'Уровень топлива',
        fuel_consumption: 'Расход топлива',
        fuel_used: 'Израсходовано топлива',
        // Электрика
        voltage: 'Напряжение бортовой сети',
        ignition: 'Зажигание',
        // Температуры
        temperature: 'Температура двигателя',
        coolant_temp: 'Температура ОЖ',
        oil_temp: 'Температура масла',
        ambient_temp: 'Температура салона',
        // Давление
        oil_pressure: 'Давление масла',
        fuel_pressure: 'Давление топлива',
        tire_pressure: 'Давление в шинах',
        // Навигация и связь
        gps_signal: 'GPS сигнал',
        gsm_signal: 'GSM сигнал',
        satellites: 'Спутники',
        // Состояния
        ignition_status: 'Статус зажигания',
        movement_status: 'Статус движения',
        alarm: 'Тревога',
        alarm_status: 'Статус тревоги',
        // Дополнительные
        driver_id: 'ID водителя',
        trailer_connected: 'Прицеп подключен',
        battery_voltage: 'Напряжение АКБ',
        backup_battery: 'Резервная батарея',
        // Если поле не найдено в словаре, будет показано исходное имя с преобразованием
    },

    initModule: function () {
        var me = this;

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Sensor Dashboard'),
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
            nodeParam: 'id',
            defaultRootProperty: 'children',
            root: { expanded: true, text: l('All Vehicles') }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('Vehicle'),
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
                text: l('Year'),
                dataIndex: 'year',
                flex: 1,
                renderer: function (v) { return v || '—'; }
            }],
            listeners: {
                selectionchange: function (selModel, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('vehid')) {
                            me.loadSensors(record.get('vehid'), record.get('name'));
                        } else {
                            me.mainPanel.down('#sensorGrid').getStore().removeAll();
                            me.mainPanel.down('#vehicleNameLabel').setText(l('Select a vehicle'));
                        }
                    }
                },
                scope: me
            }
        });

        return tree;
    },

    // Вспомогательная функция для получения понятного названия датчика
    getSensorDisplayName: function (sensorKey) {
        var key = sensorKey.toLowerCase();
        if (this.sensorNames[key]) {
            return this.sensorNames[key];
        }
        // Если нет в словаре, делаем красивое преобразование: speed -> Speed, fuel_level -> Fuel level
        return Ext.String.capitalize(Ext.String.trim(key.replace(/_/g, ' ')));
    },

    createMainPanel: function () {
        var me = this;

        var sensorStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'displayName', 'value'],
            data: []
        });

        var grid = Ext.create('Ext.grid.Panel', {
            itemId: 'sensorGrid',
            store: sensorStore,
            columns: [{
                text: l('Датчик'),
                dataIndex: 'displayName',
                flex: 2,
                renderer: function (v, meta, record) {
                    // Можно добавить подсказку с оригинальным именем
                    var originalName = record.get('name');
                    if (originalName && originalName !== v) {
                        meta.tdAttr = 'data-qtip="' + Ext.String.htmlEncode(originalName) + '"';
                    }
                    return v;
                }
            }, {
                text: l('Значение'),
                dataIndex: 'value',
                flex: 1,
                renderer: function (v, meta, record) {
                    var sensorName = record.get('name');
                    // Форматирование значения
                    if (window.speedSS && sensorName === 'speed') return window.speedSS(v);
                    if (window.mileageSS && (sensorName === 'mileage' || sensorName === 'total_mileage')) return window.mileageSS(v);
                    if (window.num) return window.num(v, 1);
                    if (sensorName === 'fuel_level') return v + ' %';
                    if (sensorName === 'temperature') return v + ' °C';
                    if (sensorName === 'voltage') return v + ' V';
                    if (sensorName === 'ignition') return v == 1 ? l('ON') : l('OFF');
                    return v;
                }
            }],
            viewConfig: {
                emptyText: l('Выберите транспортное средство в левом дереве для просмотра датчиков')
            },
            bbar: [{
                text: l('Обновить'),
                iconCls: 'fa fa-refresh',
                handler: function () {
                    var selected = me.getSelectedVehicle();
                    if (selected && selected.vehid) {
                        me.loadSensors(selected.vehid, selected.name);
                    }
                },
                scope: me
            }]
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                xtype: 'label',
                itemId: 'vehicleNameLabel',
                text: l('ТС не выбрано'),
                style: 'font-weight: bold; font-size: 14px;'
            }, '->', {
                xtype: 'button',
                text: l('Обновить'),
                iconCls: 'fa fa-refresh',
                handler: function () {
                    var selected = me.getSelectedVehicle();
                    if (selected && selected.vehid) {
                        me.loadSensors(selected.vehid, selected.name);
                    }
                }
            }]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            tbar: tbar,
            items: [grid]
        });

        mainPanel.sensorGrid = grid;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');

        return mainPanel;
    },

    loadSensors: function (vehid, vehicleName) {
        var me = this;
        var mainPanel = me.mainPanel;
        var grid = mainPanel.sensorGrid;
        var label = mainPanel.vehicleLabel;

        grid.setLoading(true);
        label.setText(vehicleName + ' (' + l('загрузка...') + ')');

        var apiUrl = me.getApiUrl('backend/ax/current_data.php');

        Ext.Ajax.request({
            method: 'POST',
            url: apiUrl,
            params: { vehid: vehid },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            timeout: 10000,
            success: function (response) {
                grid.setLoading(false);

                var data;
                try {
                    data = Ext.decode(response.responseText);
                } catch (e) {
                    Ext.Msg.alert(l('Ошибка'), l('Неверный JSON ответ'));
                    me.showEmptySensors();
                    return;
                }

                if (!data.objects || !Ext.isArray(data.objects) || data.objects.length === 0) {
                    me.showEmptySensors();
                    return;
                }

                var foundObject = null;
                for (var i = 0; i < data.objects.length; i++) {
                    var obj = data.objects[i];
                    if (obj.vehid === vehid || obj.id === vehid || obj.object_id === vehid) {
                        foundObject = obj;
                        break;
                    }
                }

                if (!foundObject) {
                    me.showEmptySensors();
                    return;
                }

                // Исключаем служебные поля, которые не являются датчиками
                var excludeKeys = ['id', 'vehid', 'object_id', 'name', 'model', 'year', 'lat', 'lon', 'plate', 'icon', 'route', 'track'];
                var records = [];
                for (var key in foundObject) {
                    if (foundObject.hasOwnProperty(key) && excludeKeys.indexOf(key) === -1) {
                        var value = foundObject[key];
                        if (value !== null && value !== undefined && value !== '') {
                            var displayName = me.getSensorDisplayName(key);
                            records.push({
                                name: key,
                                displayName: displayName,
                                value: value
                            });
                        }
                    }
                }

                if (records.length === 0) {
                    // Если не нашли датчиков, показываем всё, кроме слишком больших полей
                    for (var key in foundObject) {
                        if (foundObject.hasOwnProperty(key) && key !== 'route' && key !== 'track') {
                            var displayName = me.getSensorDisplayName(key);
                            records.push({
                                name: key,
                                displayName: displayName,
                                value: foundObject[key]
                            });
                        }
                    }
                }

                if (records.length > 0) {
                    grid.getStore().loadData(records);
                    label.setText(vehicleName);
                } else {
                    grid.getStore().loadData([{
                        name: 'Нет данных датчиков',
                        displayName: 'Нет данных',
                        value: 'Не найдено полей с датчиками'
                    }]);
                    label.setText(vehicleName + ' (нет данных)');
                }
            },
            failure: function () {
                grid.setLoading(false);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные датчиков.'));
                me.showEmptySensors();
            }
        });
    },

    showEmptySensors: function () {
        var mainPanel = this.mainPanel;
        if (mainPanel && mainPanel.sensorGrid) {
            mainPanel.sensorGrid.getStore().removeAll();
            var selected = this.getSelectedVehicle();
            mainPanel.vehicleLabel.setText(selected ? selected.name : l('ТС не выбрано'));
        }
    },

    getSelectedVehicle: function () {
        var tree = this.navTab.items.get(0);
        var selection = tree.getSelectionModel().getSelection();
        if (selection && selection.length) {
            var rec = selection[0];
            if (rec.get('vehid')) {
                return {
                    vehid: rec.get('vehid'),
                    name: rec.get('name')
                };
            }
        }
        return null;
    }
});
