Ext.define('Store.ibutton_geofence.Module', {
    extend: 'Ext.Component',
    singleton: true,

    currentMarkerId: 'ibutton_geofence_marker',

    initModule: function() {
        var me = this;
        me.bindings = me.loadBindings();
        var mainPanel = me.createMainPanel();
        var navTab = me.createNavTab(mainPanel);

        if (window.skeleton && window.skeleton.navigation) {
            window.skeleton.navigation.add(navTab);
        } else {
            console.warn('ibutton_geofence: skeleton.navigation not found');
        }

        if (window.skeleton && window.skeleton.mapframe) {
            window.skeleton.mapframe.add(mainPanel);
        }

        return mainPanel;
    },

    loadBindings: function() {
        var stored = localStorage.getItem('ibutton_geofence_bindings');
        if (stored) {
            try {
                return Ext.decode(stored);
            } catch(e) {
                return [];
            }
        }
        return [];
    },

    saveBindings: function() {
        localStorage.setItem('ibutton_geofence_bindings', Ext.encode(this.bindings));
    },

    getBindingByIbuttonId: function(ibuttonId) {
        if (!ibuttonId) return null;
        return Ext.Array.findBy(this.bindings, function(b) {
            return b.ibuttonId === ibuttonId;
        }) || null;
    },

    saveBinding: function(binding) {
        var index = Ext.Array.findIndex(this.bindings, function(b) {
            return b.ibuttonId === binding.ibuttonId;
        });
        if (index !== -1) {
            this.bindings[index] = binding;
        } else {
            this.bindings.push(binding);
        }
        this.saveBindings();
    },

    deleteBinding: function(ibuttonId) {
        this.bindings = Ext.Array.filter(this.bindings, function(b) {
            return b.ibuttonId !== ibuttonId;
        });
        this.saveBindings();
    },

    showPointOnMap: function(lat, lon, description) {
        var map = window.mapContainer;
        if (!map) {
            Ext.Msg.alert('Ошибка', 'Карта онлайн недоступна');
            return;
        }

        if (map.setMapCenter) {
            map.setMapCenter(lat, lon);
        } else if (map.map && map.map.setView) {
            map.map.setView([lat, lon], 14);
        } else {
            Ext.Msg.alert('Ошибка', 'Не удалось центрировать карту');
            return;
        }

        if (map.removeMarker) {
            map.removeMarker(this.currentMarkerId);
        } else if (map.map && map.map.eachLayer) {
            var markerToRemove = null;
            map.map.eachLayer(function(layer) {
                if (layer.options && layer.options.id === this.currentMarkerId) {
                    markerToRemove = layer;
                }
            }, this);
            if (markerToRemove) {
                map.map.removeLayer(markerToRemove);
            }
        }

        var markerOptions = {
            id: this.currentMarkerId,
            lat: lat,
            lon: lon,
            hint: description || 'Привязанная точка'
        };
        if (map.addMarker) {
            map.addMarker(markerOptions);
        } else if (map.map && window.L && window.L.marker) {
            var leafletMarker = window.L.marker([lat, lon], { title: markerOptions.hint });
            leafletMarker.options.id = markerOptions.id;
            leafletMarker.addTo(map.map);
        } else {
            console.warn('ibutton_geofence: не удалось добавить маркер');
        }
    },

    createNavTab: function(mainPanel) {
        var me = this;

        var vehiclesStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php?vehs=1&state=1',
                reader: {
                    type: 'json',
                    rootProperty: 'children'
                }
            },
            root: {
                text: 'Транспортные средства',
                expanded: true
            }
        });

        var treePanel = Ext.create('Ext.tree.Panel', {
            title: 'Список ТС',
            store: vehiclesStore,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: 'Название ТС', dataIndex: 'name', flex: 2 },
                { text: 'iButton ID', dataIndex: 'ibutton', flex: 1.5 },
                { text: 'Модель', dataIndex: 'model', flex: 1 }
            ],
            listeners: {
                selectionchange: function(tree, selected) {
                    if (selected && selected.length > 0) {
                        me.onVehicleSelected(selected[0], mainPanel);
                    }
                }
            }
        });

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'iButton GeoFence',
            iconCls: 'fa fa-key',
            layout: 'fit',
            items: [treePanel],
            map_frame: mainPanel
        });

        return navTab;
    },

    onVehicleSelected: function(record, mainPanel) {
        var me = this;
        var ibuttonId = record.get('ibutton');
        var vehicleName = record.get('name') || record.get('text') || '—';

        var infoPanel = mainPanel.infoPanel;
        if (infoPanel) {
            infoPanel.down('displayfield[name=vehicleName]').setValue(vehicleName);
            infoPanel.down('displayfield[name=ibuttonId]').setValue(ibuttonId || '—');
        }

        if (!ibuttonId) {
            if (infoPanel) {
                infoPanel.down('displayfield[name=status]').setValue('Нет iButton ID');
            }
            Ext.Msg.alert('Информация', 'У выбранного ТС нет iButton ID');
            return;
        }

        var binding = me.getBindingByIbuttonId(ibuttonId);
        if (binding) {
            var statusText = 'Точка найдена: ' + binding.lat + ', ' + binding.lon +
                             (binding.description ? ' (' + binding.description + ')' : '');
            if (infoPanel) {
                infoPanel.down('displayfield[name=status]').setValue(statusText);
                infoPanel.currentCoords = { lat: binding.lat, lon: binding.lon, desc: binding.description };
            }
            me.showPointOnMap(binding.lat, binding.lon, binding.description);
        } else {
            if (infoPanel) {
                infoPanel.down('displayfield[name=status]').setValue('Точка не задана');
                infoPanel.currentCoords = null;
            }
            Ext.Msg.alert('Информация', 'Для iButton ID ' + ibuttonId + ' точка не задана');
        }
    },

    createMainPanel: function() {
        var me = this;

        var bindingsStore = Ext.create('Ext.data.ArrayStore', {
            fields: ['ibuttonId', 'lat', 'lon', 'description'],
            data: me.bindings.map(function(b) {
                return [b.ibuttonId, b.lat, b.lon, b.description];
            })
        });

        var bindingsGrid = Ext.create('Ext.grid.Panel', {
            title: 'Привязки iButton → точка',
            store: bindingsStore,
            columns: [
                { text: 'iButton ID', dataIndex: 'ibuttonId', flex: 1 },
                { text: 'Широта', dataIndex: 'lat', width: 100 },
                { text: 'Долгота', dataIndex: 'lon', width: 100 },
                { text: 'Описание', dataIndex: 'description', flex: 1.5 }
            ],
            tbar: [
                {
                    text: 'Добавить',
                    iconCls: 'fa fa-plus',
                    handler: function() {
                        me.showBindingForm(null, bindingsStore);
                    }
                },
                {
                    text: 'Редактировать',
                    iconCls: 'fa fa-edit',
                    handler: function() {
                        var selected = bindingsGrid.getSelectionModel().getSelection();
                        if (selected.length === 0) {
                            Ext.Msg.alert('Ошибка', 'Выберите привязку для редактирования');
                            return;
                        }
                        me.showBindingForm(selected[0], bindingsStore);
                    }
                },
                {
                    text: 'Удалить',
                    iconCls: 'fa fa-trash',
                    handler: function() {
                        var selected = bindingsGrid.getSelectionModel().getSelection();
                        if (selected.length === 0) {
                            Ext.Msg.alert('Ошибка', 'Выберите привязку для удаления');
                            return;
                        }
                        var record = selected[0];
                        Ext.Msg.confirm('Подтверждение', 'Удалить привязку для iButton ' + record.get('ibuttonId') + '?', function(btn) {
                            if (btn === 'yes') {
                                me.deleteBinding(record.get('ibuttonId'));
                                bindingsStore.remove(record);
                                Ext.Msg.alert('Готово', 'Привязка удалена');
                            }
                        });
                    }
                }
            ]
        });

        var infoPanel = Ext.create('Ext.panel.Panel', {
            title: 'Информация о выбранном ТС',
            layout: 'anchor',
            margin: 10,
            defaults: { anchor: '100%', margin: '0 0 5 0' },
            items: [
                { xtype: 'displayfield', fieldLabel: 'Название ТС', name: 'vehicleName', value: '' },
                { xtype: 'displayfield', fieldLabel: 'iButton ID', name: 'ibuttonId', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Статус привязки', name: 'status', value: '' },
                {
                    xtype: 'button',
                    text: 'Показать на карте',
                    handler: function(btn) {
                        var panel = btn.up('panel');
                        if (panel.currentCoords) {
                            me.showPointOnMap(panel.currentCoords.lat, panel.currentCoords.lon, panel.currentCoords.desc);
                        } else {
                            Ext.Msg.alert('Ошибка', 'Нет координат для отображения (привязка не найдена)');
                        }
                    }
                }
            ]
        });
        infoPanel.currentCoords = null;

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            items: [
                { region: 'center', layout: 'fit', title: 'Управление привязками', items: [bindingsGrid] },
                { region: 'south', layout: 'fit', height: 180, split: true, items: [infoPanel] }
            ]
        });

        mainPanel.infoPanel = infoPanel;
        mainPanel.bindingsStore = bindingsStore;

        return mainPanel;
    },

    showBindingForm: function(record, store) {
        var me = this;
        var isEdit = (record !== null);
        var formValues = isEdit ? {
            ibuttonId: record.get('ibuttonId'),
            lat: record.get('lat'),
            lon: record.get('lon'),
            description: record.get('description')
        } : {
            ibuttonId: '',
            lat: '',
            lon: '',
            description: ''
        };

        var win = Ext.create('Ext.window.Window', {
            title: isEdit ? 'Редактировать привязку' : 'Добавить привязку',
            modal: true,
            width: 420,
            layout: 'anchor',
            defaults: { anchor: '100%', margin: 5 },
            items: [
                { xtype: 'textfield', fieldLabel: 'iButton ID', name: 'ibuttonId', value: formValues.ibuttonId, allowBlank: false },
                { xtype: 'numberfield', fieldLabel: 'Широта', name: 'lat', value: formValues.lat, step: 0.000001, allowBlank: false },
                { xtype: 'numberfield', fieldLabel: 'Долгота', name: 'lon', value: formValues.lon, step: 0.000001, allowBlank: false },
                { xtype: 'textfield', fieldLabel: 'Описание', name: 'description', value: formValues.description }
            ],
            buttons: [
                {
                    text: 'Сохранить',
                    handler: function(btn) {
                        var form = btn.up('window');
                        var ibuttonIdField = form.down('textfield[name=ibuttonId]');
                        var latField = form.down('numberfield[name=lat]');
                        var lonField = form.down('numberfield[name=lon]');
                        var descField = form.down('textfield[name=description]');

                        var ibuttonId = ibuttonIdField.getValue();
                        var lat = latField.getValue();
                        var lon = lonField.getValue();
                        var description = descField.getValue();

                        if (!ibuttonId || lat === '' || lon === '' || lat === null || lon === null) {
                            Ext.Msg.alert('Ошибка', 'Заполните все обязательные поля');
                            return;
                        }

                        var binding = {
                            ibuttonId: ibuttonId,
                            lat: parseFloat(lat),
                            lon: parseFloat(lon),
                            description: description || ''
                        };
                        me.saveBinding(binding);

                        if (isEdit) {
                            record.set('ibuttonId', binding.ibuttonId);
                            record.set('lat', binding.lat);
                            record.set('lon', binding.lon);
                            record.set('description', binding.description);
                            record.commit();
                        } else {
                            store.add([binding.ibuttonId, binding.lat, binding.lon, binding.description]);
                        }
                        store.commitChanges();

                        win.close();
                        Ext.Msg.alert('Готово', 'Привязка сохранена');
                    }
                },
                { text: 'Отмена', handler: function() { win.close(); } }
            ]
        });
        win.show();
    }
});
