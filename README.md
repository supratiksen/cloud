# A cloud-based ruleEngine prototype.
An app that shows how OpenT2T translators can be used to interact with similar devices using a common schema.

This app is a simple polling-based server that uses a ruleEngine to execute some rules. Rules are based on a predefined device hierachy that the user can create in order to define how devices are organized in logical groups, ex. LivingRoom, Kitchen, etc. This app also shows how the same thingTranslator.js handler can be used on the client as well as a cloud-based application (clearly with the assumption that the device is cloud-connected).
