sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"memberslist/test/integration/pages/MembersList",
	"memberslist/test/integration/pages/MembersObjectPage"
], function (JourneyRunner, MembersList, MembersObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('memberslist') + '/test/flp.html#app-preview',
        pages: {
			onTheMembersList: MembersList,
			onTheMembersObjectPage: MembersObjectPage
        },
        async: true
    });

    return runner;
});

