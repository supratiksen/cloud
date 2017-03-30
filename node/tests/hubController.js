import * as winston from "winston";

const sleep = require('es6-sleep').promise;
var test = require('ava');
var config = require('./hubController-testConfig');
var OpenT2TConstants = require('opent2t').OpenT2TConstants;

// Separate out authorization info to avoid accidentally commiting passwords and keys
// File must contain onboarding info for the hub:
// {
//     "onboardingInfo" : [
//         { 
//             "username": "...",
//             "password": "..."
//         },
//         {
//             "client_id": "...",
//             "client_secret": "..."
//         }
//     ]
// }
var onboardingConfig = require('./hubController-testConfig-auth.json');

var HubController = require("../hubController");
var hubController = new HubController("verbose");
var authInfo = undefined;

// setup the translator before all the tests run
test.before(async () => {
    authInfo = await hubController.onboard(config.hubId, onboardingConfig.onboardingInfo);
});

test.serial("Valid Hub Controller", t => {
    t.is(typeof hubController, 'object') && t.truthy(hubController);
});

///
/// Run a series of tests to validate the translator
///

test.serial("RefreshAuthToken returns a valid non-error response", async t => {
    var oldAccessToken = authInfo['access'].token;
    var refreshedAuthInfo = await hubController.refreshAuthToken(config.hubId, onboardingConfig.onboardingInfo, authInfo);
    console.log("********New Auth Info***********");
    console.log(JSON.stringify(refreshedAuthInfo));
    console.log("*******************");
    t.truthy(refreshedAuthInfo);
    t.not(refreshedAuthInfo['access'].token, oldAccessToken, "refreshAuthToken failed to update auth token"); 
});

test.serial('SupportedHubs', async t => {
    var supportedHubs = await hubController.supportedHubs();
    console.log("*******************");
    console.log(JSON.stringify(supportedHubs, null, 2));
    console.log("*******************");
    t.truthy(supportedHubs);
    t.is(supportedHubs instanceof Array, true);
    t.is(supportedHubs.length > 0, true);
});

test.serial('GetPlatforms', async t => {
    var platforms = await hubController.platforms(config.hubId, authInfo);
    console.log(JSON.stringify(platforms, null, 2));
    t.truthy(platforms);
    t.is(platforms.platforms.length > 0, true);
});

test.serial('getPlatform', async t => {
    var platform = await hubController.getPlatform(config.hubId, authInfo, config.getPlatform.opent2tBlob);
    t.truthy(platform);
    t.truthy(platform.entities);
    t.truthy(platform.entities[0]);
    t.is(platform.entities[0].resources.length > 0, true);
});

test.serial('subscribePlatform', async t => {
    // Subscribe the the platform specified in the test config
    var subscription = await hubController.subscribePlatform(config.hubId, authInfo, config.getPlatform.opent2tBlob, config.subscriptionInfo);
    console.log(JSON.stringify(subscription, null, 2));
    t.truthy(subscription);
    t.truthy(subscription.expiration);
});

test.serial('unsubscribePlatform', async t => {
    var subscription = await hubController.unsubscribePlatform(config.hubId, authInfo, config.getPlatform.opent2tBlob, config.subscriptionInfo);
    console.log(JSON.stringify(subscription, null, 2));
    t.truthy(subscription);
    t.is(subscription.expiration, 0);
});

test.serial('subscribeVerify', async t => {
    // Verify PubSubHubbub (Wink) style subscription verification.

    var verificationRequest = {};
    verificationRequest.url = "http://contoso.com:8000?hub.topic=" + config.subscription.topic +
        "&hub.challenge=" + config.subscription.challenge + 
        "&hub.lease_seconds=" + config.subscription.expiration +
        "&hub.mode=subscribe";
    
    var subscription = await hubController.subscribeVerify(config.hubId, authInfo, verificationRequest); 

    console.log(JSON.stringify(subscription, null, 2));
    t.truthy(subscription);
    t.is(subscription.response, config.subscription.challenge);
    t.is(subscription.expiration, config.subscription.expiration);
});

test.serial('translatePlatforms', async t => {
    var verificationInfo = {};
    verificationInfo.key = config.subscriptionInfo.key;

    // Calculate an HMAC for the message that will be validated successfully
    var hmac = require('crypto').createHmac('sha1', config.subscriptionInfo.key);
    hmac.update(JSON.stringify(config.subscription.sampleFeed));
    verificationInfo.hmac = hmac.digest("hex");
    verificationInfo.header = {
        "X-Hub-Signature": verificationInfo.hmac
    };

    var translatedFeed = await hubController.translatePlatforms(
        config.hubId, authInfo, config.subscription.sampleFeed, verificationInfo);
    console.log(JSON.stringify(translatedFeed, null, 2));
    t.truthy(translatedFeed);
    t.truthy(translatedFeed.platforms);    
    t.truthy(translatedFeed.platforms[0]);
    t.truthy(translatedFeed.platforms[0].entities);
    t.truthy(translatedFeed.platforms[0].entities[0]);
    t.is(translatedFeed.platforms[0].entities[0].resources.length > 0, true);
});

test.serial('translatePlatformsInvalidHmac', async t => {

    var verificationInfo = {};
    verificationInfo.key = config.subscriptionInfo.key;

    verificationInfo.header = { 
    "X-Hub-Signature": "this_wont_match_the_hash" 
    }; 
 
   // Verify that no platforms are translated as the signatures did not match. 
   const error = await t.throws(hubController.translatePlatforms(config.hubId, authInfo, config.subscription.sampleFeed, verificationInfo)); 
   t.is(error.name, "OpenT2TError");
   t.is(error.statusCode, 401);
   t.is(error.innerError.message, OpenT2TConstants.HMacSignatureVerificationFailed);
});

test.serial('InvalidHubIdThrowsForAnyAPI', async t => {
    const error = await t.throws(hubController.onboard("NonExistentHub", onboardingConfig.onboardingInfo));
    t.is(error.name, "OpenT2TError");
    t.is(error.statusCode, 404);
    t.is(error.innerError.message, OpenT2TConstants.InvalidHubId);
});

test.serial('UndefinedOnboardingInfoForRefreshAuthTokenThrows', async t => {
    const error = await t.throws(hubController.refreshAuthToken(config.hubId, "undefined", authInfo));
    t.is(error.name, "OpenT2TError");
    t.is(error.statusCode, 401);
    t.is(error.innerError.message, OpenT2TConstants.InvalidAuthInfoInput);
});

test.serial('InvalidOnboardingInfoForRefreshAuthTokenThrows', async t =>{
    var invalidOnboardingConfig = require('./hubController-testConfig-Invalidauth.json');
    const error = await t.throws(hubController.refreshAuthToken(config.hubId, invalidOnboardingConfig.onboardingInfo, authInfo));
    t.is(error.name, "OpenT2TError");
    t.is(error.statusCode, 401);
    t.is(error.innerError.message, OpenT2TConstants.InvalidAuthInfoInput);
});

test.serial('Unknown platform', async t => {
    const translation = await hubController.translatePlatforms(config.hubId, authInfo, config.translation.unknownplatform);
    t.is(translation.platforms.length, 0);
    t.is(translation.errors.length, 1);
    t.is(translation.errors[0].name, 'OpenT2TError');
    t.is(translation.errors[0].statusCode, 404);
    t.true(translation.errors[0].message.startsWith(OpenT2TConstants.UnknownPlatform));
    t.true(translation.errors[0].message.endsWith(config.translation.unknownplatform.model_name));
});

test.serial('Adding, removing and enumerating transports', async t => {
    hubController.addTransport(winston.transports.Http);
    t.is(hubController.getConfiguredTransports().length, 2);
    hubController.removeTransport(winston.transports.Http);
    t.is(hubController.getConfiguredTransports().length, 1);
    hubController.addTransport(winston.transports.Http);
    t.is(hubController.getConfiguredTransports().length, 2);
});

test.serial('Invoking getter/setter for logLevel', async t => {
    let transportList = hubController.getConfiguredTransports();
    t.is(hubController.getLogLevel(transportList[0]), 'verbose'); // default log level
    hubController.setLogLevel(transportList[0], 'info');
    t.is(hubController.getLogLevel(transportList[0]), 'info');
});

test.serial('Invoking getter/setter for correlationVector', async t => {
    hubController.setCorrelationVector("ABC123");
    t.is(hubController.getCorrelationVector(), 'ABC123');
});

