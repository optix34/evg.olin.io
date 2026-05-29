Ext.define('Store.test_ble.Module', {
    extend: 'Ext.Component',
    singleton: true,

    initModule: function() {
        var mainPanel = Ext.create('Ext.panel.Panel', {
            title: 'Test',
            html: 'OK'
        });

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Test',
            iconCls: 'fa fa-car',
            map_frame: mainPanel
        });

        if (window.skeleton && window.skeleton.navigation) {
            window.skeleton.navigation.add(navTab);
        }

        if (window.skeleton && window.skeleton.mapframe) {
            window.skeleton.mapframe.add(mainPanel);
        }

        return mainPanel;
    }
});
