/**
 * Sensor Dashboard Extension for PILOT
 * Right panel: configurable fields (АОГ, Видео, Табло, Голос, ТФ, КПП, ТХГ, ДУТ, Датчик t)
 * Values stored in localStorage per vehicle.
 */
Ext.define('Store.sensor_dashboard.Module', {
    extend: 'Ext.Component',

    configFields: [
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

        // Левая панель (обычная, без Pilot.utils.LeftBarPanel)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Sensor Dashboard',
            iconCls: 'fa fa-microchip',
            cls: 'pilot-leftbar-panel',
            width: 300,
            layout: 'fit',
            items: [me.createVehicleTree()]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        if (skeleton && skeleton.navigation) {
            skeleton.navigation.add(navTab);
        }
        if (skeleton && skeleton.mapframe) {
            skeleton.mapframe.add(mainPanel);
        }

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
                },
                scope: me
            }
        });

        return tree;
    },

    createMainPanel: function () {
        var me = this;

        var fieldContainer = Ext.create('Ext.container.Container', {
            itemId: 'configFieldsContainer',
            layout: 'form',
            defaults: {
                xtype: 'radiogroup',
                width: 300,
                items: [
                    { boxLabel: 'Да', name: 'option', inputValue: 'yes' },
                    { boxLabel: 'Нет', name: 'option', inputValue: 'no' }
                ]
            },
            margin: '10 10 10 10'
        });

        var applyBtn = Ext.create('Ext.button.Button', {
            text: 'Применить',
            handler: function () {
                me.saveCurrentConfig();
                me.setFieldsEditable(false);
            },
            scope: me
        });

        var editBtn = Ext.create('Ext.button.Button', {
            text: 'Редактировать',
            handler: function () {
                me.setFieldsEditable(true);
            },
            scope: me
        });

        var tbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                { xtype: 'label', itemId: 'vehicleNameLabel', text: 'ТС не выбрано', style: 'font-weight: bold; font-size: 14px;' },
                '->',
                applyBtn,
                editBtn
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            tbar: tbar,
            items: [fieldContainer]
        });

        mainPanel.fieldContainer = fieldContainer;
        mainPanel.vehicleLabel = tbar.down('#vehicleNameLabel');
        mainPanel.applyBtn = applyBtn;
        mainPanel.editBtn = editBtn;

        return mainPanel;
    },

    loadConfigForVehicle: function (vehid, vehicleName) {
        var me = this;
        var mainPanel = me.mainPanel;
        var container = mainPanel.fieldContainer;
        var label = mainPanel.vehicleLabel;

        label.setText(vehicleName);

        var storageKey = 'sensor_dashboard_' + vehid;
        var saved = localStorage.getItem(storageKey);
        var values = saved ? JSON.parse(saved) : {};

        var items = [];
        Ext.each(me.configFields, function (field) {
            var checkedValue = values[field.name] === 'yes' ? 'yes' : 'no';
            items.push({
                xtype: 'radiogroup',
                fieldLabel: field.label,
                itemId: field.name,
                width: 350,
                items: [
                    { boxLabel: 'Да', name: 'option', inputValue: 'yes', checked: checkedValue === 'yes' },
                    { boxLabel: 'Нет', name: 'option', inputValue: 'no', checked: checkedValue === 'no' }
                ],
                disabled: true
            });
        });

        container.removeAll();
        container.add(items);

        me.currentVehid = vehid;
        me.currentVehicleName = vehicleName;
    },

    saveCurrentConfig: function () {
        var me = this;
        if (!me.currentVehid) return;

        var container = me.mainPanel.fieldContainer;
        var values = {};

        Ext.each(me.configFields, function (field) {
            var radioGroup = container.down('#' + field.name);
            if (radioGroup) {
                var selected = radioGroup.getValue();
                values[field.name] = (selected && selected.option === 'yes') ? 'yes' : 'no';
            }
        });

        var storageKey = 'sensor_dashboard_' + me.currentVehid;
        localStorage.setItem(storageKey, JSON.stringify(values));
        Ext.Msg.alert('Сохранено', 'Настройки сохранены');
    },

    setFieldsEditable: function (editable) {
        var container = this.mainPanel.fieldContainer;
        Ext.each(this.configFields, function (field) {
            var comp = container.down('#' + field.name);
            if (comp) comp.setDisabled(!editable);
        });
    },

    clearConfigForm: function () {
        var mainPanel = this.mainPanel;
        mainPanel.fieldContainer.removeAll();
        mainPanel.vehicleLabel.setText('ТС не выбрано');
        this.currentVehid = null;
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
