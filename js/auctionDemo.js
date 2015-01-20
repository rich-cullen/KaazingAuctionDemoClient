$(function () {

    // enable application tracing
    // $(window).load(function () {
    //     Tracer.setTrace(true);
    // });

    // global variables
    var jmsConnectionFactory = new JmsConnectionFactory('ws://' + location.hostname + ':8001/jms'),
        connection,
        session,
        userId = generateGuid(), // TODO: this obviously regenerates if the user hits F5. Maybe use logname instead?
        TOPIC = { CARS: "Cars", GUITARS: "Guitars", AUCTION_APP_SERVER: "AuctionAppServer" },
        MESSAGE_TYPE = { INITIALISE: 0, BID: 1, BUY: 2, SELL: 3, STOCK_UPDATE: 4, BROADCAST: 5, CONFIRMATION: 6, WARNING: 7 },
        TOASTR_TYPE = { SUCCESS: 0, INFO: 1, WARNING: 2, ERROR: 3 },
        PRODUCT_CATEGORY = { CAR: 0, GUITAR: 1 },
        loginBox = new LoginBox('modalLogin'),
        loginAttempts = 0,
        logname,
        viewModel = {
            cars: ko.observableArray(),
            guitars: ko.observableArray()
        };

    //
    // event handlers
    //
    function onBtnConnectClick(event) {

        var username = '', //null,
            password = ''; // null

        try {
            var connectionFuture = jmsConnectionFactory.createConnection(username, password, function () {
                if (!connectionFuture.exception) {
                    try {
                        connection = connectionFuture.getValue();
                        connection.setExceptionListener(handleException);
                        session = connection.createSession(false, Session.AUTO_ACKNOWLEDGE);
                        connection.start(onConnectionSuccess);
                    }
                    catch (e) {
                        handleException(e);
                    }
                }
                else {
                    handleException(connectionFuture.exception);
                }
            });
        }
        catch (e) {
            handleException(e);
        }
    }

    function onBtnDisconnectClick(event) {
        try {
            connection.close(function () {
                updateConnectionButtons(false);
                $('#tableCars > tbody > tr').remove();
                $('#tableGuitars > tbody > tr').remove();
                showToast(TOASTR_TYPE.WARNING, 'Connection terminated by ' + (logname || 'anonymous user'), 'Gateway Connection Terminated', 3000);
            });
        }
        catch (e) {
            handleException(e);
        }
    }

    function onConnectionSuccess() {
        showToast(TOASTR_TYPE.SUCCESS, 'Connection initiated successfully by ' + (logname || 'anonymous user'), 'Gateway Connection Initiated', 3000);
        updateConnectionButtons(true);
        loginAttempts = 0;
        subscribeToQueue(userId);
        subscribeToTopic(TOPIC.CARS);
        subscribeToTopic(TOPIC.GUITARS);
    }

    function onMessage(textMessage) {

        var message = JSON.parse(textMessage.getText());

        // if message is a stock update then update the viewmodel accordingly
        if (message.Type === MESSAGE_TYPE.STOCK_UPDATE) {
            if (message.Category === PRODUCT_CATEGORY.CAR) {
                viewModel.cars(message.AuctionItems);
            }
            else if (message.Category === PRODUCT_CATEGORY.GUITAR) {
                viewModel.guitars(message.AuctionItems);
            }
        }

        // if message is a broadcast then display message text
        if (message.Type === MESSAGE_TYPE.BROADCAST && !excludeUserFromBroadcast(message.BroadcastExcludedUserIds)) {
            toastr.info(message.Text, message.Title);
        }

        // if message is a bid or buy confirmation then display message text 
        if (message.Type === MESSAGE_TYPE.CONFIRMATION) {
            toastr.success(message.Text, message.Title);
        }

        if (message.Type === MESSAGE_TYPE.WARNING) {
            toastr.warning(message.Text, message.Title);
        }
    }

    function onBtnActionClick(event) {
        var info = $(this).val().split('_'),
            action = info[0],
            product = info[1],
            id = info[2],
            amount,
            destination,
            producer,
            msg;

        if (action === 'Bid') {
            amount = $('#txtBidAmount').val();
            if (!amount || isNaN(amount)) {
                toastr.warning('Please enter a bid amount in order to place a bid');
                return;
            }
        }

        var message = {
            Type: action === 'Bid' ? MESSAGE_TYPE.BID : MESSAGE_TYPE.BUY,
            ProductCategory: product === 'Car' ? PRODUCT_CATEGORY.CAR : PRODUCT_CATEGORY.GUITAR,
            ProductId: id,
            Amount: action === 'Bid' ? amount : 0,
            UserId: userId
        };

        destination = session.createTopic('/topic/' + TOPIC.AUCTION_APP_SERVER);
        producer = session.createProducer(destination);
        msg = session.createTextMessage(JSON.stringify(message));
        producer.send(msg, null);
        producer.close();
    }

    function onBtnSellCarClick(event) {

        var description = $('#txtCarDescription').val(),
            year = $('#txtCarYear').val(),
            cost = $('#txtCarCost').val(),
            destination,
            producer,
            msg;

        if (!description || !year || !cost || isNaN(year) || isNaN(cost)) {
            toastr.warning('Please enter the relevant details', 'Incomplete Car Details!');
        }
        else {
            var message = {
                Type: MESSAGE_TYPE.SELL,
                ProductCategory: PRODUCT_CATEGORY.CAR,
                Description: description,
                Year: year,
                Amount: cost,
                UserId: userId
            }

            destination = session.createTopic('/topic/' + TOPIC.AUCTION_APP_SERVER);
            producer = session.createProducer(destination);
            msg = session.createTextMessage(JSON.stringify(message));
            producer.send(msg, null);
            producer.close();
        }
    }

    function onBtnSellGuitarClick(event) {

        var description = $('#txtGuitarDescription').val(),
            year = $('#txtGuitarYear').val(),
            cost = $('#txtGuitarCost').val(),
            destination,
            producer,
            msg;

        if (!description || !year || !cost || isNaN(year) || isNaN(cost)) {
            toastr.warning('Please enter the relevant details!', 'Incomplete Guitar Details!');
        }
        else {
            var message = {
                Type: MESSAGE_TYPE.SELL,
                ProductCategory: PRODUCT_CATEGORY.GUITAR,
                Description: description,
                Year: year,
                Amount: cost,
                UserId: userId
            }

            destination = session.createTopic('/topic/' + TOPIC.AUCTION_APP_SERVER);
            producer = session.createProducer(destination);
            msg = session.createTextMessage(JSON.stringify(message));
            producer.send(msg, null);
            producer.close();
        }
    }

    //
    // utility functions
    //
    function handleException(e) {
        toastr.error('Exception - ' + e, 'Application error!');
        console.log('EXCEPTION: ' + e);
    }

    function updateConnectionButtons(isConnected) {
        if (isConnected) {
            $('#btnConnect').attr('disabled', 'disabled').removeClass('btn-success');
            $('#btnDisconnect').removeAttr('disabled').addClass('btn-danger');
        }
        else {
            $('#btnConnect').removeAttr('disabled').addClass('btn-success');
            $('#btnDisconnect').attr('disabled', 'disabled').removeClass('btn-danger');
        }
    }

    function subscribeToTopic(topic) {
        var destination,
            consumer;

        destination = session.createTopic('/topic/' + topic);
        consumer = session.createConsumer(destination);
        consumer.setMessageListener(onMessage);
    }

    function subscribeToQueue(queue) {
        var destination,
            consumer;

        destination = session.createQueue('/queue/' + queue);
        consumer = session.createConsumer(destination);
        consumer.setMessageListener(onMessage);
    }

    function generateGuid() {
        function S4() {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        }

        return (S4() + S4() + "-" + S4() + "-4" + S4().substr(0, 3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase();
    }

    function excludeUserFromBroadcast(excludedUserIds) {
        var id;
        if (excludedUserIds) {
            for (var i = 0, j = excludedUserIds.length; i < j; i++) {
                if (excludedUserIds[i] === userId) {
                    return true;
                }
            }
        }

        return false;
    }

    function showToast(type, message, title, timeOut) {

        var originalTimeOut,
            toastrFunction;

        if (timeOut) {
            originalTimeOut = toastr.options.timeOut;
            toastr.options.timeOut = timeOut;
        }

        switch (type) {
            case TOASTR_TYPE.SUCCESS:
                toastrFunction = toastr.success;
                break;
            case TOASTR_TYPE.INFO:
                toastrFunction = toastr.info;
                break;
            case TOASTR_TYPE.WARNING:
                toastrFunction = toastr.warning;
                break;
            case TOASTR_TYPE.ERROR:
                toastrFunction = toastr.error;
                break;
        }

        if (title !== undefined && title !== '') {
            toastrFunction(message, title);
        }
        else {
            toastrFunction(message);
        }

        if (timeOut) {
            toastr.options.timeOut = originalTimeOut;
        }
    }

    function initialiseModals() {

        var $newCar = $('#modalNewCar'),
            $btnSellCar = $('#btnSellCar'),
            $newGuitar = $('#modalNewGuitar'),
            $btnSellGuitar = $('#btnSellGuitar');

        $newCar
            .on('show', function () {
                $newCar.on('keyup', function (event) {
                    if (event.keyCode === 13) {
                        $btnSellCar.click();
                    }
                });
            })
            .on('shown', function () {
                $('#txtCarDescription').focus();
            })
            .on('hide', function () {
                $newCar.off('keyup');
            });

        $newGuitar
            .on('show', function () {
                $newGuitar.on('keyup', function (event) {
                    if (event.keyCode === 13) {
                        $btnSellGuitar.click();
                    }
                });
            })
            .on('shown', function () {
                $('#txtGuitarDescription').focus();
            })
            .on('hide', function () {
                $newGuitar.off('keyup');
            });
    }

    //
    // Constructor functions
    //    
    function LoginBox(loginBoxId) {

        var self = this,
            $loginBox = $('#' + loginBoxId);

        this.show = function () {
            $loginBox.modal('show');
        };

        this.challengeHandlerGatewayCallback = function () { };

        $loginBox
            .on('show', function () {
                $('#loginErrorMessage').html(loginAttempts > 0 ? 'Incorrect logname/password. Please try again.<br /><br />' : '');
                $('#txtPassword').val('');
                $loginBox.on('keyup', function (event) {
                    if (event.keyCode === 13) {
                        $('#btnLoginModalLogin').click();
                    }
                    else if (event.keyCode === 27) {
                        loginAttempts = 0;
                    }
                });
            })
            .on('shown', function () {
                $('#txtLogname').focus();
            })
            .on('hide', function () {
                $loginBox.off('keyup');
            });

        $('#btnLoginModalClose, #btnLoginModalCancel').on('click', function () {
            loginAttempts = 0;
        });

        $('#btnLoginModalLogin').on('click', function () {
            loginAttempts++;
            logname = $('#txtLogname').val();
            var credentials = new PasswordAuthentication(logname, $('#txtPassword').val());
            setTimeout(function () { self.challengeHandlerGatewayCallback(credentials); }, 500);
        });
    }

    //
    // attach event handlers
    //
    $('#btnConnect').on('click', onBtnConnectClick);
    $('#btnDisconnect').on('click', onBtnDisconnectClick);
    $('#tableCars, #tableGuitars').on('click', 'button.btnAction', onBtnActionClick);
    $('#btnSellCar').on('click', onBtnSellCarClick);
    $('#btnSellGuitar').on('click', onBtnSellGuitarClick);
    initialiseModals();

    // Configure and register challenge handlers
    var basicHandler = new BasicChallengeHandler();
    basicHandler.loginHandler = function (callback) {
        loginBox.challengeHandlerGatewayCallback = callback;
        loginBox.show();
    }

    // basicHandler.canHandle = function (challengeRequest) { // debug testing of the issued ChallengeRequest
    //     alert(JSON.stringify(challengeRequest));
    //     alert(challengeRequest.location);
    //     alert(challengeRequest.authenticationScheme);
    //     alert(challengeRequest.authenticationParameters);
    //     return true;
    // };

    var webSocketFactory = jmsConnectionFactory.getWebSocketFactory();
    webSocketFactory.setChallengeHandler(basicHandler);

    // activate tooltips    
    $('#bidHelp').tooltip();

    // custom knockout bindings
    ko.bindingHandlers.currencyText = {
        update: function (element, valueAccessor) {
            var value = ko.utils.unwrapObservable(valueAccessor());
            if (value) {
                $(element).text(accounting.formatMoney(value, '£'));
            }
        }
    }

    // knockout binding
    ko.applyBindings(viewModel);
});