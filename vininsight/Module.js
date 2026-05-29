/**
 * PILOT Extension: VIN Insight
 * 
 * Назначение:
 *   - Загружает реальный список транспортных средств из PILOT (/ax/tree.php?vehs=1&state=1)
 *   - Позволяет ввести API-ключ сервиса auto.dev (сохраняет в localStorage)
 *   - При выборе ТС из списка выполняет расшифровку VIN через прокси PILOT
 *   - Отображает расшифрованные данные: основную информацию и сырой JSON
 * 
 * Полностью соответствует AI_SPECS.md, паттерн 1 (вкладка навигации + главная панель)
 */

Ext.define('Store.vininsight.Module', {
    extend: 'Ext.Component',          // обязательное наследование от Ext.Component
    singleton: true,                  // расширение существует в единственном экземпляре

    /**
     * Главный метод инициализации расширения.
     * Вызывается PILOT после загрузки Module.js.
     * @returns {Ext.panel.Panel} Главная панель, которая будет показана в mapframe
     */
    initModule: function() {
        // 1. Создаём главную панель (она будет отображаться в правой части интерфейса)
        var mainPanel = this.createMainPanel();
        
        // 2. Создаём вкладку (навигационный элемент слева)
        var navTab = this.createNavTab(mainPanel);
        
        // 3. Добавляем вкладку в левую навигацию PILOT
        if (window.skeleton && window.skeleton.navigation) {
            window.skeleton.navigation.add(navTab);
        } else {
            // В production такой ситуации не возникнет, но для отладки выведем предупреждение
            console.warn('VIN Insight: skeleton.navigation не найден');
        }
        
        // 4. Возвращаем главную панель (PILOT сам поместит её в mapframe)
        return mainPanel;
    },

    /**
     * Создаёт главную панель с верхней панелью настроек, секциями "Обзор" и "Raw Decode".
     * @returns {Ext.panel.Panel}
     */
    createMainPanel: function() {
        var self = this;
        
        // --- Секция "Обзор" (информация о ТС и расшифрованные данные) ---
        var overviewContainer = Ext.create('Ext.container.Container', {
            title: 'Обзор',
            layout: 'anchor',
            margin: 10,
            defaults: { anchor: '100%', margin: '0 0 5 0' },
            items: [
                { xtype: 'displayfield', fieldLabel: 'Название ТС', name: 'vehicleName', value: '' },
                { xtype: 'displayfield', fieldLabel: 'VIN', name: 'vehicleVin', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Статус расшифровки', name: 'decodeStatus', value: 'Не выбрано ТС' },
                { xtype: 'displayfield', fieldLabel: 'Марка', name: 'make', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Модель', name: 'model', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Год', name: 'year', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Кузов', name: 'bodyType', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Двигатель', name: 'engine', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Трансмиссия', name: 'transmission', value: '' },
                { xtype: 'displayfield', fieldLabel: 'Привод', name: 'driveType', value: '' }
            ]
        });
        
        // --- Секция "Сырая расшифровка" (красивый JSON) ---
        var rawDecodeContainer = Ext.create('Ext.container.Container', {
            title: 'Сырая расшифровка (Raw Decode)',
            layout: 'fit',
            margin: 10,
            items: [{
                xtype: 'textarea',
                name: 'rawJson',
                readOnly: true,
                value: '',
                height: 200
            }]
        });
        
        // --- Главная панель с верхней панелью инструментов и двумя секциями ---
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [
                    { xtype: 'label', text: 'API-ключ auto.dev:', margin: '0 10 0 0' },
                    {
                        xtype: 'textfield',
                        name: 'apiKeyField',
                        width: 300,
                        emptyText: 'Введите ваш API-ключ',
                        value: localStorage.getItem('vininsight_apikey') || ''
                    },
                    {
                        xtype: 'button',
                        text: 'Сохранить ключ',
                        handler: function(btn) {
                            var field = btn.up('toolbar').down('textfield[name=apiKeyField]');
                            var key = field.getValue();
                            if (key) {
                                localStorage.setItem('vininsight_apikey', key);
                                Ext.Msg.alert('Сохранено', 'API-ключ сохранён в localStorage');
                            } else {
                                localStorage.removeItem('vininsight_apikey');
                                Ext.Msg.alert('Очищено', 'API-ключ удалён');
                            }
                        }
                    },
                    {
                        xtype: 'button',
                        text: 'Test API (тестовый VIN)',
                        handler: function() {
                            var testVin = '3GCUDHEL3NG668790';
                            var apiKey = localStorage.getItem('vininsight_apikey');
                            if (!apiKey) {
                                Ext.Msg.alert('Ошибка', 'Сначала сохраните API-ключ');
                                return;
                            }
                            // Показываем статус "Расшифровывается" для тестового VIN
                            self.updateDecodeStatus(overviewContainer, 'Расшифровывается...');
                            self.decodeVin(testVin, apiKey, overviewContainer, rawDecodeContainer);
                        }
                    }
                ]
            }],
            items: [
                {
                    region: 'center',
                    layout: 'vbox',
                    items: [
                        { xtype: 'panel', title: 'Информация о транспортном средстве', layout: 'fit', flex: 1, items: [overviewContainer] },
                        { xtype: 'panel', title: 'Детали расшифровки', layout: 'fit', flex: 1, items: [rawDecodeContainer] }
                    ]
                }
            ]
        });
        
        // Сохраняем ссылки на контейнеры для обновления при выборе ТС
        mainPanel.overviewContainer = overviewContainer;
        mainPanel.rawDecodeContainer = rawDecodeContainer;
        
        return mainPanel;
    },
    
    /**
     * Создаёт вкладку навигации с деревом/списком транспортных средств.
     * @param {Ext.panel.Panel} mainPanel - главная панель для связывания
     * @returns {Ext.panel.Panel} Вкладка навигации
     */
    createNavTab: function(mainPanel) {
        var self = this;
        
        // Создаём store для загрузки данных ТС через /ax/tree.php
        var vehiclesStore = Ext.create('Ext.data.TreeStore', {
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php?vehs=1&state=1',
                reader: {
                    type: 'json',
                    // Предполагаем, что ответ сервера — массив узлов, которые мы поместим в корневой узел
                    rootProperty: 'children'
                }
            },
            root: {
                text: 'Транспортные средства',
                expanded: true,
                children: []      // будут заполнены после загрузки
            },
            listeners: {
                load: function(store, records, successful) {
                    if (!successful) {
                        Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС из PILOT');
                    }
                }
            }
        });
        
        // Дерево (tree panel) с нужными колонками
        var treePanel = Ext.create('Ext.tree.Panel', {
            title: 'Список ТС',
            store: vehiclesStore,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: 'Название ТС', dataIndex: 'name', flex: 2 },
                { text: 'VIN', dataIndex: 'vin', flex: 1.5 },
                { text: 'Модель', dataIndex: 'model', flex: 1 },
                { text: 'Год', dataIndex: 'year', flex: 0.5, align: 'center' }
            ],
            listeners: {
                selectionchange: function(tree, selected) {
                    if (selected && selected.length > 0) {
                        var record = selected[0];
                        self.onVehicleSelected(record, mainPanel);
                    }
                }
            }
        });
        
        // Создаём саму вкладку навигации
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'VIN Insight',
            iconCls: 'fa fa-car',          // Font Awesome v6
            layout: 'fit',
            items: [treePanel],
            // Связываем вкладку с главной панелью (требование паттерна 1)
            map_frame: mainPanel
        });
        
        return navTab;
    },
    
    /**
     * Обработчик выбора транспортного средства из дерева.
     * Извлекает VIN, выполняет расшифровку (если есть VIN и ключ).
     * @param {Ext.data.Model} record - выбранная запись
     * @param {Ext.panel.Panel} mainPanel - главная панель для обновления UI
     */
    onVehicleSelected: function(record, mainPanel) {
        var overview = mainPanel.overviewContainer;
        var rawContainer = mainPanel.rawDecodeContainer;
        
        // Извлекаем поля ТС (в зависимости от структуры ответа /ax/tree.php)
        var vehicleName = record.get('name') || record.get('text') || '—';
        var vin = record.get('vin') || '';
        var model = record.get('model') || '—';
        var year = record.get('year') || '—';
        
        // Обновляем секцию "Обзор" базовой информацией
        overview.down('displayfield[name=vehicleName]').setValue(vehicleName);
        overview.down('displayfield[name=vehicleVin]').setValue(vin || '—');
        overview.down('displayfield[name=model]').setValue(model);
        overview.down('displayfield[name=year]').setValue(year);
        // Очищаем старые расшифрованные поля
        overview.down('displayfield[name=make]').setValue('');
        overview.down('displayfield[name=bodyType]').setValue('');
        overview.down('displayfield[name=engine]').setValue('');
        overview.down('displayfield[name=transmission]').setValue('');
        overview.down('displayfield[name=driveType]').setValue('');
        rawContainer.down('textarea[name=rawJson]').setValue('');
        
        if (!vin) {
            this.updateDecodeStatus(overview, 'VIN не указан');
            return;
        }
        
        // Получаем API-ключ из localStorage
        var apiKey = localStorage.getItem('vininsight_apikey');
        if (!apiKey) {
            this.updateDecodeStatus(overview, 'Нет API-ключа (сохраните его в верхней панели)');
            return;
        }
        
        // Запускаем расшифровку
        this.updateDecodeStatus(overview, 'Расшифровывается...');
        this.decodeVin(vin, apiKey, overview, rawContainer);
    },
    
    /**
     * Выполняет запрос к auto.dev через прокси PILOT.
     * @param {string} vin - VIN номер
     * @param {string} apiKey - API-ключ
     * @param {Ext.container.Container} overviewContainer - контейнер для статуса/полей
     * @param {Ext.container.Container} rawContainer - контейнер для сырого JSON
     */
    decodeVin: function(vin, apiKey, overviewContainer, rawContainer) {
        var self = this;
        
        // Используем проксированный URL, который должен быть настроен в PILOT:
        // /store/vininsight/autodev/vin/{vin}?apiKey=...
        var proxyUrl = 'autodev/vin/' + encodeURIComponent(vin) + '?apiKey=' + encodeURIComponent(apiKey);
        
        Ext.Ajax.request({
            url: proxyUrl,
            method: 'GET',
            timeout: 15000,
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    self.onDecodeSuccess(data, overviewContainer, rawContainer);
                } catch (e) {
                    self.onDecodeError('Неверный JSON от сервера: ' + e.message, overviewContainer);
                }
            },
            failure: function(response) {
                var errorMsg = 'Запрос не удался (HTTP ' + response.status + ')';
                if (response.status === 404) {
                    errorMsg += ' — возможно, прокси auto.dev не настроен. Убедитесь, что путь autodev/... проксируется.';
                }
                self.onDecodeError(errorMsg, overviewContainer);
            }
        });
    },
    
    /**
     * Обрабатывает успешный ответ от auto.dev.
     * @param {Object} data - декодированный JSON
     * @param {Ext.container.Container} overviewContainer
     * @param {Ext.container.Container} rawContainer
     */
    onDecodeSuccess: function(data, overviewContainer, rawContainer) {
        // Обновляем статус
        this.updateDecodeStatus(overviewContainer, 'Расшифровано');
        
        // Извлекаем основные поля (структура может меняться, но ориентируемся на типовой ответ auto.dev)
        var make = data.make || data.brand || data.manufacturer || '';
        var model = data.model || '';
        var year = data.year || data.modelYear || '';
        var bodyType = data.bodyType || data.body_style || '';
        var engine = data.engine || data.engineType || '';
        var transmission = data.transmission || '';
        var driveType = data.driveType || data.drivetrain || '';
        
        overviewContainer.down('displayfield[name=make]').setValue(make);
        overviewContainer.down('displayfield[name=model]').setValue(model);
        overviewContainer.down('displayfield[name=year]').setValue(year);
        overviewContainer.down('displayfield[name=bodyType]').setValue(bodyType);
        overviewContainer.down('displayfield[name=engine]').setValue(engine);
        overviewContainer.down('displayfield[name=transmission]').setValue(transmission);
        overviewContainer.down('displayfield[name=driveType]').setValue(driveType);
        
        // Показываем сырой JSON в отформатированном виде
        var prettyJson = JSON.stringify(data, null, 2);
        rawContainer.down('textarea[name=rawJson]').setValue(prettyJson);
    },
    
    /**
     * Обрабатывает ошибку расшифровки.
     * @param {string} errorMessage
     * @param {Ext.container.Container} overviewContainer
     */
    onDecodeError: function(errorMessage, overviewContainer) {
        this.updateDecodeStatus(overviewContainer, 'Ошибка: ' + errorMessage);
        // Очищаем поля расшифровки
        overviewContainer.down('displayfield[name=make]').setValue('');
        overviewContainer.down('displayfield[name=bodyType]').setValue('');
        overviewContainer.down('displayfield[name=engine]').setValue('');
        overviewContainer.down('displayfield[name=transmission]').setValue('');
        overviewContainer.down('displayfield[name=driveType]').setValue('');
    },
    
    /**
     * Обновляет поле статуса расшифровки.
     * @param {Ext.container.Container} overviewContainer
     * @param {string} statusText
     */
    updateDecodeStatus: function(overviewContainer, statusText) {
        var statusField = overviewContainer.down('displayfield[name=decodeStatus]');
        if (statusField) {
            statusField.setValue(statusText);
        }
    }
});
