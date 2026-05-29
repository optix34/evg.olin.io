/**
 * Marks Manager Extension for PILOT GPS
 * 
 * This extension allows users to create and manage custom marks (bookmarks)
 * associated with real vehicles from the PILOT system.
 * Marks are stored locally in the browser's localStorage.
 * 
 * Pattern: Navigation tab + Main panel (mapframe)
 * Follows AI_SPECS.md strictly.
 */

Ext.define('Store.marks_manager.Module', {
    extend: 'Ext.Component',

    /**
     * @property {String} storageKey
     * Key used for localStorage to store marks.
     */
    storageKey: 'marks_manager_marks',

    /**
     * @property {Ext.data.Store} vehicleStore
     * Store that holds vehicles for the combobox.
     */
    vehicleStore: null,

    /**
     * @property {Ext.grid.Panel} marksGrid
     * Reference to the left grid.
     */
    marksGrid: null,

    /**
     * @property {Ext.panel.Panel} detailsPanel
     * Reference to the right details panel.
     */
    detailsPanel: null,

    /**
     * @property {Object} currentMark
     * Currently selected mark object.
     */
    currentMark: null,

    /**
     * Entry point called by PILOT when the extension is loaded.
     * Must be a class method (not a global function).
     */
    initModule: function() {
        var me = this;

        // 1. Load vehicles from PILOT (hierarchical tree)
        me.loadVehicles(function(vehiclesArray) {
            // Create a store for the combobox
            me.vehicleStore = Ext.create('Ext.data.Store', {
                fields: ['vehid', 'name'],
                data: vehiclesArray
            });

            // 2. Create left navigation tab
            var leftPanel = me.createLeftPanel();
            // 3. Create right main panel (details)
            var rightPanel = me.createRightPanel();

            // 4. Link them (important for some internal PILOT logic)
            leftPanel.map_frame = rightPanel;

            // 5. Add to PILOT skeleton
            skeleton.navigation.add(leftPanel);
            skeleton.mapframe.add(rightPanel);

            // 6. Load marks from localStorage and populate grid
            me.refreshMarksGrid();
        });
    },

    /**
     * Loads vehicles from /ax/tree.php?vehs=1&state=1
     * Parses hierarchical groups and extracts vehicles.
     * @param {Function} callback Called with array of {vehid, name}
     */
    loadVehicles: function(callback) {
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: {
                vehs: 1,
                state: 1
            },
            scope: this,
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    var vehicles = [];
                    // Recursively traverse the tree to collect vehicles
                    function traverse(node) {
                        if (node.children && Ext.isArray(node.children)) {
                            Ext.each(node.children, function(child) {
                                // If child has a 'vehid' field, it's a vehicle
                                if (child.vehid !== undefined) {
                                    vehicles.push({
                                        vehid: child.vehid,
                                        name: child.name || l('Unknown')
                                    });
                                }
                                // Recurse if there are more children
                                if (child.children) {
                                    traverse(child);
                                }
                            });
                        }
                    }
                    // The response is an array of root groups
                    Ext.each(data, function(rootGroup) {
                        traverse(rootGroup);
                    });
                    callback(vehicles);
                } catch(e) {
                    Ext.Msg.alert(l('Error'), l('Failed to parse vehicle data'));
                    callback([]);
                }
            },
            failure: function() {
                Ext.Msg.alert(l('Error'), l('Could not load vehicles from PILOT. Please refresh the page.'));
                callback([]);
            }
        });
    },

    /**
     * Creates the left navigation panel containing toolbar and grid.
     * @returns {Ext.panel.Panel}
     */
    createLeftPanel: function() {
        var me = this;

        // Create the grid that will display marks
        me.marksGrid = Ext.create('Ext.grid.Panel', {
            flex: 1,
            store: Ext.create('Ext.data.Store', {
                fields: ['id', 'trackerId', 'trackerName', 'description', 'lat', 'lon', 'lastFixTime'],
                data: []
            }),
            columns: [
                { text: l('Mark ID'), dataIndex: 'id', width: 80, renderer: function(v) { return Ext.String.ellipsis(v, 10); } },
                { text: l('Tracker'), dataIndex: 'trackerName', flex: 1 },
                { text: l('Description'), dataIndex: 'description', flex: 2, renderer: function(v) { return Ext.String.ellipsis(v || '', 30); } },
                { text: l('Last Fix'), dataIndex: 'lastFixTime', width: 140, renderer: function(v) { return v ? Ext.util.Format.date(new Date(v), 'Y-m-d H:i:s') : ''; } }
            ],
            listeners: {
                selectionchange: function(grid, selected) {
                    if (selected && selected.length > 0) {
                        me.currentMark = selected[0].data;
                        me.showMarkDetails(me.currentMark);
                    } else {
                        me.currentMark = null;
                        me.showMarkDetails(null);
                    }
                },
                scope: me
            }
        });

        // Toolbar with "Add Mark" button
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                {
                    text: l('Add Mark'),
                    iconCls: 'fa fa-plus',
                    handler: function() {
                        me.openMarkWindow(null); // null = create new
                    },
                    scope: me
                }
            ]
        });

        // Left panel container (must be a panel, not a grid directly)
        var leftPanel = Ext.create('Ext.panel.Panel', {
            title: l('Marks Manager'),
            iconCls: 'fa fa-bookmark',
            layout: 'vbox',
            items: [toolbar, me.marksGrid]
        });

        return leftPanel;
    },

    /**
     * Creates the right main panel (details view).
     * @returns {Ext.panel.Panel}
     */
    createRightPanel: function() {
        var me = this;

        me.detailsPanel = Ext.create('Ext.panel.Panel', {
            title: l('Mark Details'),
            layout: 'vbox',
            bodyPadding: 10,
            items: [
                {
                    xtype: 'container',
                    layout: 'anchor',
                    defaults: { anchor: '100%', margin: '0 0 10 0' },
                    items: [
                        { xtype: 'displayfield', fieldLabel: l('Mark ID'), name: 'id' },
                        { xtype: 'displayfield', fieldLabel: l('Tracker'), name: 'trackerName' },
                        { xtype: 'displayfield', fieldLabel: l('Description'), name: 'description' },
                        { xtype: 'displayfield', fieldLabel: l('Latitude'), name: 'lat' },
                        { xtype: 'displayfield', fieldLabel: l('Longitude'), name: 'lon' },
                        { xtype: 'displayfield', fieldLabel: l('Last Fix Time'), name: 'lastFixTime', renderer: function(v) { return v ? Ext.util.Format.date(new Date(v), 'Y-m-d H:i:s') : ''; } }
                    ]
                },
                {
                    xtype: 'container',
                    layout: 'hbox',
                    defaults: { margin: '0 5 0 0' },
                    items: [
                        {
                            text: l('Update'),
                            iconCls: 'fa fa-edit',
                            handler: function() {
                                if (me.currentMark) {
                                    me.openMarkWindow(me.currentMark);
                                } else {
                                    Ext.Msg.alert(l('Notice'), l('Please select a mark first.'));
                                }
                            },
                            scope: me
                        },
                        {
                            text: l('Delete'),
                            iconCls: 'fa fa-trash',
                            handler: function() {
                                if (me.currentMark) {
                                    Ext.Msg.confirm(l('Confirm'), l('Delete this mark?'), function(btn) {
                                        if (btn === 'yes') {
                                            me.deleteMark(me.currentMark.id);
                                        }
                                    });
                                } else {
                                    Ext.Msg.alert(l('Notice'), l('Please select a mark first.'));
                                }
                            },
                            scope: me
                        },
                        {
                            text: l('Show on Map'),
                            iconCls: 'fa fa-map-marker',
                            handler: function() {
                                if (me.currentMark && me.currentMark.lat && me.currentMark.lon) {
                                    me.centerMapOnCoordinates(me.currentMark.lat, me.currentMark.lon);
                                } else {
                                    Ext.Msg.alert(l('Notice'), l('No coordinates available for this mark.'));
                                }
                            },
                            scope: me
                        }
                    ]
                }
            ],
            // Default message when no mark is selected
            tbar: [
                { xtype: 'component', html: '<i class="fa fa-info-circle"></i> ' + l('Select a mark from the left panel to view details') }
            ]
        });

        return me.detailsPanel;
    },

    /**
     * Shows details of a selected mark in the right panel.
     * @param {Object} mark Mark object or null to clear.
     */
    showMarkDetails: function(mark) {
        var panel = this.detailsPanel;
        if (!mark) {
            // Clear all display fields
            var fields = ['id', 'trackerName', 'description', 'lat', 'lon', 'lastFixTime'];
            Ext.each(fields, function(field) {
                var fieldCmp = panel.down('displayfield[name=' + field + ']');
                if (fieldCmp) fieldCmp.setValue('');
            });
            return;
        }

        panel.down('displayfield[name=id]').setValue(mark.id);
        panel.down('displayfield[name=trackerName]').setValue(mark.trackerName);
        panel.down('displayfield[name=description]').setValue(mark.description || '');
        panel.down('displayfield[name=lat]').setValue(mark.lat);
        panel.down('displayfield[name=lon]').setValue(mark.lon);
        panel.down('displayfield[name=lastFixTime]').setValue(mark.lastFixTime);
    },

    /**
     * Opens a modal window for adding or editing a mark.
     * @param {Object|null} existingMark Mark to edit, or null for new.
     */
    openMarkWindow: function(existingMark) {
        var me = this;
        var isEdit = (existingMark !== null);
        var windowTitle = isEdit ? l('Edit Mark') : l('Add Mark');

        // Create the form panel
        var formPanel = Ext.create('Ext.form.Panel', {
            bodyPadding: 10,
            defaults: {
                anchor: '100%',
                margin: '0 0 10 0',
                labelWidth: 80
            },
            items: [
                {
                    xtype: 'textfield',
                    name: 'id',
                    fieldLabel: l('Mark ID'),
                    allowBlank: false,
                    disabled: isEdit,
                    value: isEdit ? existingMark.id : '',
                    regex: /^[a-zA-Z0-9_\-]+$/,
                    regexText: l('Only letters, numbers, underscore and hyphen allowed')
                },
                {
                    xtype: 'combobox',
                    name: 'trackerId',
                    fieldLabel: l('Tracker'),
                    store: me.vehicleStore,
                    displayField: 'name',
                    valueField: 'vehid',
                    queryMode: 'local',
                    allowBlank: false,
                    editable: false,
                    value: isEdit ? existingMark.trackerId : null,
                    listeners: {
                        select: function(combo, record) {
                            // Optionally store trackerName for display
                            var selectedName = record.get('name');
                            combo.setValue(record.get('vehid'));
                            // We'll get the name later on save
                        }
                    }
                },
                {
                    xtype: 'textarea',
                    name: 'description',
                    fieldLabel: l('Description'),
                    value: isEdit ? existingMark.description : ''
                },
                {
                    xtype: 'numberfield',
                    name: 'lat',
                    fieldLabel: l('Latitude'),
                    allowBlank: false,
                    step: 0.000001,
                    decimalPrecision: 6,
                    value: isEdit ? existingMark.lat : 0
                },
                {
                    xtype: 'numberfield',
                    name: 'lon',
                    fieldLabel: l('Longitude'),
                    allowBlank: false,
                    step: 0.000001,
                    decimalPrecision: 6,
                    value: isEdit ? existingMark.lon : 0
                }
            ]
        });

        var win = Ext.create('Ext.window.Window', {
            title: windowTitle,
            width: 450,
            modal: true,
            layout: 'fit',
            items: [formPanel],
            buttons: [
                {
                    text: l('Save'),
                    handler: function() {
                        var form = formPanel.getForm();
                        if (form.isValid()) {
                            var values = form.getValues();
                            // Get tracker name from vehicleStore
                            var trackerRecord = me.vehicleStore.findRecord('vehid', values.trackerId);
                            var trackerName = trackerRecord ? trackerRecord.get('name') : '';

                            if (isEdit) {
                                // Update existing mark
                                var updatedMark = Ext.apply({}, existingMark, {
                                    trackerId: values.trackerId,
                                    trackerName: trackerName,
                                    description: values.description,
                                    lat: parseFloat(values.lat),
                                    lon: parseFloat(values.lon),
                                    lastFixTime: new Date().toISOString()
                                });
                                me.updateMark(updatedMark);
                            } else {
                                // Create new mark
                                var newMark = {
                                    id: values.id,
                                    trackerId: values.trackerId,
                                    trackerName: trackerName,
                                    description: values.description,
                                    lat: parseFloat(values.lat),
                                    lon: parseFloat(values.lon),
                                    lastFixTime: new Date().toISOString()
                                };
                                me.createMark(newMark);
                            }
                            win.close();
                        }
                    },
                    scope: me
                },
                {
                    text: l('Cancel'),
                    handler: function() { win.close(); }
                }
            ]
        });

        win.show();
    },

    /**
     * Retrieves all marks from localStorage.
     * @returns {Array} Array of mark objects.
     */
    getAllMarks: function() {
        var marksJson = localStorage.getItem(this.storageKey);
        if (!marksJson) return [];
        try {
            return Ext.decode(marksJson);
        } catch(e) {
            return [];
        }
    },

    /**
     * Saves the marks array to localStorage.
     * @param {Array} marks Array of mark objects.
     */
    saveAllMarks: function(marks) {
        localStorage.setItem(this.storageKey, Ext.encode(marks));
    },

    /**
     * Creates a new mark (adds to storage and refreshes grid).
     * @param {Object} mark Mark object to add.
     */
    createMark: function(mark) {
        var marks = this.getAllMarks();
        // Ensure unique ID
        if (marks.some(function(m) { return m.id === mark.id; })) {
            Ext.Msg.alert(l('Error'), l('Mark ID already exists. Please choose a different ID.'));
            return false;
        }
        marks.push(mark);
        this.saveAllMarks(marks);
        this.refreshMarksGrid();
        return true;
    },

    /**
     * Updates an existing mark.
     * @param {Object} updatedMark Mark with updated fields.
     */
    updateMark: function(updatedMark) {
        var marks = this.getAllMarks();
        var index = Ext.Array.findIndex(marks, function(m) { return m.id === updatedMark.id; });
        if (index !== -1) {
            marks[index] = updatedMark;
            this.saveAllMarks(marks);
            this.refreshMarksGrid();
            // If the updated mark was currently selected, refresh details
            if (this.currentMark && this.currentMark.id === updatedMark.id) {
                this.currentMark = updatedMark;
                this.showMarkDetails(updatedMark);
            }
        } else {
            Ext.Msg.alert(l('Error'), l('Mark not found for update.'));
        }
    },

    /**
     * Deletes a mark by ID.
     * @param {String} markId ID of the mark to delete.
     */
    deleteMark: function(markId) {
        var marks = this.getAllMarks();
        var newMarks = Ext.Array.filter(marks, function(m) { return m.id !== markId; });
        if (newMarks.length === marks.length) {
            Ext.Msg.alert(l('Error'), l('Mark not found.'));
            return;
        }
        this.saveAllMarks(newMarks);
        this.refreshMarksGrid();
        if (this.currentMark && this.currentMark.id === markId) {
            this.currentMark = null;
            this.showMarkDetails(null);
        }
    },

    /**
     * Refreshes the left grid with marks from localStorage.
     */
    refreshMarksGrid: function() {
        var marks = this.getAllMarks();
        // Sort by lastFixTime descending (newest first)
        marks.sort(function(a, b) {
            return new Date(b.lastFixTime) - new Date(a.lastFixTime);
        });
        this.marksGrid.getStore().loadData(marks);
        // Clear selection if any (but keep currentMark reference? better to clear)
        this.marksGrid.getSelectionModel().deselectAll();
        this.currentMark = null;
        this.showMarkDetails(null);
    },

    /**
     * Attempts to center the active PILOT map on given coordinates.
     * @param {Number} lat Latitude
     * @param {Number} lon Longitude
     */
    centerMapOnCoordinates: function(lat, lon) {
        // Helper to get active map container (preferred method from AI_SPECS.md)
        var getActiveMap = function() {
            if (window.getActiveTabMapContainer && typeof window.getActiveTabMapContainer === 'function') {
                return window.getActiveTabMapContainer();
            }
            return window.mapContainer || null;
        };

        var map = getActiveMap();
        if (map && typeof map.setMapCenter === 'function') {
            map.setMapCenter(lat, lon);
            // Optionally set zoom to reasonable level
            if (typeof map.setMapZoom === 'function') {
                map.setMapZoom(14);
            }
        } else {
            Ext.Msg.alert(l('Map not available'), l('Cannot access the map. Make sure you are in Online or History section.'));
        }
    }
});
