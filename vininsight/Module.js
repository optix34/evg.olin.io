/**
 * VIN Insight - PILOT Extension
 * 
 * Extension that enriches PILOT vehicle data with VIN decode information
 * from the auto.dev API.
 * 
 * Pattern: Navigation tab + Main panel (Pattern 1)
 * Layout: Main panel with tbar (top toolbar) and hbox layout with 2 panels
 */

Ext.define('Store.vininsight.Module', {
    extend: 'Ext.Component',
    
    /**
     * Main initialization function called by PILOT
     * This is a class method as required by the spec
     */
    initModule: function () {
        var me = this;
        
        console.log('VIN Insight extension initializing...');
        
        // Create the navigation tab (left panel)
        // This will be added to skeleton.navigation
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'VIN Insight',
            iconCls: 'fa fa-car',  // Font Awesome v6 icon as required
            layout: 'fit',
            items: [{
                xtype: 'treepanel',
                 title:'VIN Insight',
                tools:[{
                            xtype:'button',
                            iconCls: 'fa fa-rotate',
                            tooltip: l('Refresh'),
                            handler: function () {
                                this.up('treepanel').getStore().load();
                            }
                        }],
                rootVisible: false,
                useArrows: true,
                border: false,
                // Create the tree store that loads vehicle data from PILOT API
                store: Ext.create('Ext.data.TreeStore', {
                    proxy: {
                        type: 'ajax',
                        url: '/ax/tree.php?vehs=1&state=1'
                        // No reader needed - uses default tree reader
                    },
                    root: {
                        text: 'Vehicles',
                        expanded: true
                    },
                    autoLoad: true
                }),
                // Define columns for the tree
                columns: [{
                    text: 'Vehicle',
                    xtype:'treecolumn',
                    dataIndex: 'name',
                    flex: 2,
                    renderer: function(value) {
                        return value || 'Unknown';
                    }
                }, {
                    text: 'VIN',
                    dataIndex: 'vin',
                    flex: 2,
                    renderer: function(value) {
                        return value || 'Not specified';
                    }
                }, {
                    text: 'Model',
                    dataIndex: 'model',
                    flex: 1,
                    renderer: function(value) {
                        return value || 'Unknown';
                    }
                }, {
                    text: 'Year',
                    dataIndex: 'year',
                    flex: 1,
                    renderer: function(value) {
                        return value || 'Unknown';
                    }
                }],
                // Handle vehicle selection
                listeners: {
                    selectionchange: function(tree, selected) {
                        if (selected.length > 0) {
                            var record = selected[0];
                            me.onVehicleSelect(record);
                        }
                    }
                }
            }]
        });
        
        // Create the main panel (right content area)
        // This will be displayed in the mapframe area
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            autoScroll: true,
            // Top toolbar with API controls
            tbar: [{
                xtype: 'tbtext',
                text: 'API Key:',
                margin: '0 5 0 0'
            }, {
                xtype: 'textfield',
                name: 'apiKey',
                width: 250,
                emptyText: 'Enter auto.dev API key',
                value: localStorage.getItem('vininsight_apikey') || '',
                listeners: {
                    change: function(field, newValue) {
                        localStorage.setItem('vininsight_apikey', newValue);
                    }
                }
            }, {
                xtype: 'button',
                text: 'Save',
                margin: '0 5 0 0',
                handler: function() {
                    var apiKeyField = this.up('toolbar').down('textfield[name=apiKey]');
                    var apiKey = apiKeyField.getValue();
                    localStorage.setItem('vininsight_apikey', apiKey);
                    Ext.Msg.alert('Success', 'API key saved');
                }
            }, {
                xtype: 'button',
                text: 'Test API',
                handler: function() {
                    me.testAPI();
                }
            }, '->', {  // Spacer
                xtype: 'tbtext',
                text: 'Test VIN: 3GCUDHEL3NG668790',
                margin: '0 10 0 0'
            }],
            // Content area with two panels side by side
            items:[{
                    xtype:'container',
                    layout:'hbox',
                    autoScroll: true,
                    items:  [
                    // Left panel for vehicle data - will be dynamically updated
                    {
                        xtype: 'panel',
                        title: 'Vehicle Information',
                        flex: 1,
                        bodyPadding: 10,
                        itemId: 'dataPanel',
                        html: '<div class="vehicle-info">' +
                              '<h3>Select a vehicle</h3>' +
                              '<p>Choose a vehicle from the left panel to see details</p>' +
                              '</div>'
                    },
                    // Right panel for raw decode data
                    {
                        xtype: 'panel',
                        title: 'Raw Decode Data',
                        flex: 1,
                        bodyPadding: 10,
                        itemId: 'rawPanel',
                        html: '<div class="raw-data">' +
                              '<h4>JSON Response</h4>' +
                              '<pre id="raw-data-content">No data available</pre>' +
                              '</div>'
                    }
                ]
                   }
                  ]
        });
        
        // Store references for later use
        me.mainPanel = mainPanel;
        me.navTab = navTab;
        
        // Link navigation tab to main panel (CRITICAL RULE for Pattern 1)
        navTab.map_frame = mainPanel;
        
        // Add to PILOT interface
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);
    },
    
    /**
     * Handle vehicle selection from tree
     */
    onVehicleSelect: function(record) {
        var me = this;
        
        if (!me.mainPanel) return;
        
        // Get vehicle data
        var vehicleName = record.get('name') || 'Unknown';
        var vin = record.get('vin') || '';
        var model = record.get('model') || 'Unknown';
        var year = record.get('year') || 'Unknown';
        
        // Store current vehicle for later use
        me.currentVehicle = {
            name: vehicleName,
            vin: vin,
            model: model,
            year: year,
            record: record
        };
        
        // Update the data panel with proper Ext JS components
        var dataPanel = me.mainPanel.down('#dataPanel');
        if (dataPanel) {
            // Remove existing items and add new ones
            dataPanel.removeAll();
            
            // Add header
            dataPanel.add({
                xtype: 'component',
                html: '<h2>' + Ext.util.Format.htmlEncode(vehicleName) + '</h2>',
                margin: '0 0 15 0'
            });
            
            // Add vehicle details in a fieldset
            dataPanel.add({
                xtype: 'fieldset',
                title: 'Vehicle Details',
                margin: '0 0 15 0',
                defaults: {
                    xtype: 'displayfield',
                    labelWidth: 80
                },
                items: [{
                    fieldLabel: 'VIN',
                    value: vin || 'Not specified'
                }, {
                    fieldLabel: 'Model',
                    value: model
                }, {
                    fieldLabel: 'Year',
                    value: year
                }]
            });
            
            // Add decode section
            var decodeFieldset = Ext.create('Ext.form.FieldSet', {
                title: 'VIN Decode',
                margin: '0 0 15 0',
                itemId: 'decodeFieldset',
                items: [{
                    xtype: 'container',
                    layout: 'hbox',
                    items: [{
                        xtype: 'component',
                        html: '<strong>Status:</strong>',
                        margin: '0 10 0 0'
                    }, {
                        xtype: 'component',
                        html: '<span id="decode-status">Not decoded</span>',
                        itemId: 'decodeStatus'
                    }]
                }]
            });
            
            dataPanel.add(decodeFieldset);
            
            // Add decode button if VIN exists
            if (vin && vin.trim() !== '') {
                decodeFieldset.add({
                    xtype: 'button',
                    text: 'Decode VIN',
                    margin: '10 0 0 0',
                    handler: function() {
                        me.decodeVIN(vin);
                    }
                });
            } else {
                decodeFieldset.add({
                    xtype: 'component',
                    html: '<p style="color: #666; margin: 10px 0;">VIN not specified for this vehicle</p>'
                });
            }
            
            // Add container for decoded fields (initially hidden)
            dataPanel.add({
                xtype: 'fieldset',
                title: 'Decoded Information',
                itemId: 'decodedFields',
                hidden: true,
                margin: '15 0 0 0',
                items: [{
                    xtype: 'container',
                    itemId: 'decodedContent',
                    html: 'No decoded data available'
                }]
            });
            
        }
        
        // Clear raw data panel
        var rawPanel = me.mainPanel.down('#rawPanel');
        if (rawPanel) {
            rawPanel.update('<div class="raw-data">' +
                          '<h4>JSON Response</h4>' +
                          '<pre id="raw-data-content">No data available</pre>' +
                          '</div>');
        }
    },
    
    /**
     * Decode VIN using auto.dev API
     */
    decodeVIN: function(vin) {
        var me = this;
        
        if (!vin || vin.trim() === '') {
            Ext.Msg.alert('Error', 'VIN not specified');
            return;
        }
        
        var apiKey = localStorage.getItem('vininsight_apikey');
        if (!apiKey || apiKey.trim() === '') {
            Ext.Msg.alert('API Key Required', 
                'Please enter your auto.dev API key in the top toolbar first.');
            return;
        }
        
        // Update status
        var dataPanel = me.mainPanel.down('#dataPanel');
        if (dataPanel) {
            var decodeStatus = dataPanel.down('#decodeStatus');
            if (decodeStatus) {
                decodeStatus.update('<span style="color: orange;">Decoding...</span>');
            }
        }
        
        // Make API call via proxy
        Ext.Ajax.request({
            url: 'autodev/vin/' + encodeURIComponent(vin)+'?apiKey='+apiKey,
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    me.displayDecodedData(vin, data);
                } catch (e) {
                    me.handleDecodeError('Failed to parse API response: ' + e.message);
                }
            },
            failure: function(response) {
                me.handleDecodeError('API request failed: ' + (response.statusText || 'Unknown error'));
            }
        });
    },
    
    /**
     * Display decoded VIN data
     */
    displayDecodedData: function(vin, data) {
        var me = this;
        
        // Update status in data panel
        var dataPanel = me.mainPanel.down('#dataPanel');
        if (dataPanel) {
            var decodeStatus = dataPanel.down('#decodeStatus');
            if (decodeStatus) {
                decodeStatus.update('<span style="color: green;">Decoded</span>');
            }
            
            // Show decoded fields section
            var decodedFields = dataPanel.down('#decodedFields');
            var decodedContent = dataPanel.down('#decodedContent');
            
            if (decodedFields && decodedContent) {
                decodedFields.show();
                
                // Create a grid of decoded fields
                var fieldsHtml = '<table style="width:100%; border-collapse:collapse;">';
                fieldsHtml += '<tr style="background:#f5f5f5;">';
                fieldsHtml += '<th style="text-align:left; padding:8px; border:1px solid #ddd;">Field</th>';
                fieldsHtml += '<th style="text-align:left; padding:8px; border:1px solid #ddd;">Value</th>';
                fieldsHtml += '</tr>';
                
                // Add all fields from the response
                Ext.Object.each(data, function(key, value) {
                    if (value && typeof value !== 'object') {
                        fieldsHtml += '<tr>';
                        fieldsHtml += '<td style="padding:8px; border:1px solid #eee;"><strong>' + 
                                Ext.util.Format.htmlEncode(key) + '</strong></td>';
                        fieldsHtml += '<td style="padding:8px; border:1px solid #eee;">' + 
                                Ext.util.Format.htmlEncode(value.toString()) + '</td>';
                        fieldsHtml += '</tr>';
                    }
                });
                
                fieldsHtml += '</table>';
                decodedContent.update(fieldsHtml);
            }
        }
        
        // Update raw data panel with pretty JSON
        var rawPanel = me.mainPanel.down('#rawPanel');
        if (rawPanel) {
            var prettyJson = JSON.stringify(data, null, 2);
            rawPanel.update('<div class="raw-data">' +
                          '<h4>JSON Response</h4>' +
                          '<pre id="raw-data-content" style="font-family: monospace; font-size: 12px; background: #f5f5f5; padding: 10px; border-radius: 4px;">' + 
                          Ext.util.Format.htmlEncode(prettyJson) + '</pre>' +
                          '</div>');
        }
    },
    
    /**
     * Handle VIN decode errors
     */
    handleDecodeError: function(errorMessage) {
        var me = this;
        
        // Update status in data panel
        var dataPanel = me.mainPanel.down('#dataPanel');
        if (dataPanel) {
            var decodeStatus = dataPanel.down('#decodeStatus');
            if (decodeStatus) {
                decodeStatus.update('<span style="color: red;">Error: ' + Ext.util.Format.htmlEncode(errorMessage) + '</span>');
            }
        }
        
        Ext.Msg.alert('Decode Error', errorMessage);
    },
    
    /**
     * Test API connection with sample VIN
     */
    testAPI: function() {
        var me = this;
        var apiKey = localStorage.getItem('vininsight_apikey');
        
        if (!apiKey || apiKey.trim() === '') {
            Ext.Msg.alert('API Key Required', 
                'Please enter your auto.dev API key first.');
            return;
        }
        
        // Test with sample VIN from requirements
        var testVIN = '3GCUDHEL3NG668790';
        
        Ext.Msg.wait('Testing API connection with sample VIN...', 'Testing');
        
        Ext.Ajax.request({
            url: 'autodev/vin/' + encodeURIComponent(testVIN)+'?apiKey='+apiKey,
            success: function(response) {
                Ext.Msg.hide();
                try {
                    var data = Ext.decode(response.responseText);
                    Ext.Msg.alert('API Test Successful', 
                        'API connection successful!<br><br>' +
                        'Sample VIN decoded successfully.<br>' +
                        'Vehicle: ' + (data.make || 'Unknown') + ' ' + (data.model || 'Unknown'));
                } catch (e) {
                    Ext.Msg.alert('API Test Failed', 
                        'Failed to parse API response. Check your API key.');
                }
            },
            failure: function(response) {
                Ext.Msg.hide();
                Ext.Msg.alert('API Test Failed', 
                    'API request failed. Please check:<br>' +
                    '1. Your API key is valid<br>' +
                    '2. You have access to VIN decode API<br>' +
                    '3. Network connectivity');
            }
        });
    }
});
