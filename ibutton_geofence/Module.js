Ext.define('Store.test_ble.Module', {
    extend: 'Ext.Component',
    singleton: true,

    initModule: function() {
        return Ext.create('Ext.panel.Panel', {
            title: 'Test',
            html: 'OK'
        });
    }
});
