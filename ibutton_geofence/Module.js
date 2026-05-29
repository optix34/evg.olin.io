Ext.define('Store.test_ble.Module', {
    singleton: true,
    initModule: function() {
        var panel = Ext.create('Ext.panel.Panel', {
            title: 'Test',
            html: 'OK'
        });
        if (window.skeleton && window.skeleton.navigation) {
            window.skeleton.navigation.add({
                title: 'Test',
                map_frame: panel
            });
        }
        return panel;
    }
});
