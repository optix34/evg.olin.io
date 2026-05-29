Ext.define('Store.test_ble.Module', {
    extend: 'Ext.Component',
    singleton: true,

    initModule: function() {
        var mainPanel = Ext.create('Ext.panel.Panel', {
            title: 'Тестовое расширение',
            html: '<h2>Успех!</h2><p>Расширение test_ble работает.</p>',
            bodyPadding: 10
        });

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Test BLE',
            iconCls: 'fa fa-bluetooth',
            layout: 'fit',
            items: [mainPanel],
            map_frame: mainPanel
        });

        if (window.skeleton && window.skeleton.navigation) {
            window.skeleton.navigation.add(navTab);
        } else {
            console.warn('test_ble: skeleton.navigation не найден');
        }

        return mainPanel;
    }
});
