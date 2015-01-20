$(function () {

    // global variables
    var connection,
                    session;

    //
    // event handlers
    //
    function onBtnConnectClick(event) {

        var username = null,
                        password = null,
                        gatewayLocation = $('#txtGatewayLocation').val(),
                        stompConnectionFactory = new StompConnectionFactory(gatewayLocation);

        console.log('CONNECTING TO ' + gatewayLocation);

        try {
            var connectionFuture = stompConnectionFactory.createConnection(username, password, function () {
                if (!connectionFuture.exception) {
                    try {
                        connection = connectionFuture.getValue();
                        connection.setExceptionListener(handleException);

                        console.log('CONNECTED');

                        session = connection.createSession(false, Session.AUTO_ACKNOWLEDGE);
                        transactedSession = connection.createSession(true, Session.AUTO_ACKNOWLEDGE);

                        connection.start(function () {
                            updateConnectionButtons(true);
                            toastr.success('Gateway connection established successfully');
                        });
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
        console.log('CLOSING CONNECTION');
        try {
            connection.close(function () {
                console.log('CONNECTION CLOSED');
                updateConnectionButtons(false);
                toastr.warning('Gateway connection terminated by the user');
            });
        }
        catch (e) {
            handleException(e);
        }
    };

    function onBtnSubscribeClick(event) {

        var destination,
                        consumer;

        destination = createDestination($('#txtDestination').val(), session);
        consumer = session.createConsumer(destination);

        consumer.setMessageListener(function (message) {
            var msgText = message.getText() + '\n';
            $('#txtareaMessageResponse').append(msgText);
        });
    }

    function onBtnPublishClick(event) {
        var destination,
                        producer,
                        msg;

        destination = createDestination($('#txtDestination').val(), session);
        producer = session.createProducer(destination);

        msg = session.createTextMessage($('#txtMessage').val());

        producer.send(msg, null);
        producer.close();
    }

    //
    // Kaazing JMS functions
    //
    function createDestination(name, session) {
        if ($('#radTopic').is(':checked')) {
            return session.createTopic('/topic/' + name);
        }
        else {
            return session.createQueue('/queue/' + name);
        }
    }

    //
    // utility functions
    //
    function handleException(e) {
        toastr.error('Application error! See log for details');
        console.log('EXCEPTION: ' + e);
    }

    function updateConnectionButtons(isConnected) {
        if (isConnected) {
            $('#btnConnect').attr('disabled', 'disabled').removeClass('btn-success');
            $('#btnSubscribe').removeAttr('disabled').addClass('btn-primary');
            $('#btnPublish').removeAttr('disabled').addClass('btn-primary');
            $('#btnDisconnect').removeAttr('disabled').addClass('btn-danger');
        }
        else {
            $('#btnConnect').removeAttr('disabled').addClass('btn-success');
            $('#btnSubscribe').attr('disabled', 'disabled').removeClass('btn-primary');
            $('#btnPublish').attr('disabled', 'disabled').removeClass('btn-primary');
            $('#btnDisconnect').attr('disabled', 'disabled').removeClass('btn-danger');
        }
    }

    //
    // attach event handlers
    //
    $('#btnConnect').on('click', onBtnConnectClick);
    $('#btnSubscribe').on('click', onBtnSubscribeClick);
    $('#btnPublish').on('click', onBtnPublishClick);
    $('#btnDisconnect').on('click', onBtnDisconnectClick);

});