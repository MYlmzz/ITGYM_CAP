sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"trainers/test/integration/pages/TrainersList",
	"trainers/test/integration/pages/TrainersObjectPage"
], function (JourneyRunner, TrainersList, TrainersObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('trainers') + '/test/flp.html#app-preview',
        pages: {
			onTheTrainersList: TrainersList,
			onTheTrainersObjectPage: TrainersObjectPage
        },
        async: true
    });

    return runner;
});

