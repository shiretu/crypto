/**
 * IPC message types for NN communication.
 *
 * Protocol: <4B type><4B length><NB payload>
 *
 * @property {number} RequestLoadModel   - the payload is a JSON object with all necessary properties to load a model (or create one)
 * @property {number} ResponseLoadModel  - the payload is a JSON object with all necessary properties to confirm the model was loaded, or an error if it failed
 * @property {number} RequestSaveModel   - the payload is a JSON object with all necessary properties to save a model
 * @property {number} ResponseSaveModel  - the payload is a JSON object with all necessary properties to confirm the model was saved, or an error if it failed
 * @property {number} RequestTrain       - the payload is an array of float64s representing training data, including the wanted output values (which I believe they are called labels)
 * @property {number} ResponseTrain      - the payload is a JSON object with all necessary properties to confirm the training was completed, or an error if it failed
 * @property {number} RequestPredict     - the payload is an array of float64s representing input data to predict on, and the response should be an array of float64s representing the predicted output values
 * @property {number} ResponsePredict    - the payload is an array of float64s representing the predicted output values
 * @property {number} NotifyError        - the payload is a JSON object describing the error
 */
const MessageType = Object.freeze({
    RequestLoadModel: 1,
    ResponseLoadModel: 2,
    RequestSaveModel: 3,
    ResponseSaveModel: 4,
    RequestTrain: 5,
    ResponseTrain: 6,
    RequestPredict: 7,
    ResponsePredict: 8,
    NotifyError: 9
})

export default MessageType
