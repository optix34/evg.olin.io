// Глобальная функция инициализации модуля
function initModule() {
    // Создаём главную панель
    var mainPanel = Ext.create('Ext.panel.Panel', {
        title: 'Test BLE',
        html: '<div style="padding:20px"><h2>Расширение работает!</h2><p>Модуль загружен через глобальную функцию.</p></div>'
    });

    // Создаём вкладку навигации
    var navTab = Ext.create('Ext.panel.Panel', {
        title: 'Test BLE',
        layout: 'fit',
        items: [mainPanel],
        map_frame: mainPanel
    });

    // Добавляем вкладку
    if (window.skeleton && window.skeleton.navigation) {
        window.skeleton.navigation.add(navTab);
    }

    return mainPanel;
}
