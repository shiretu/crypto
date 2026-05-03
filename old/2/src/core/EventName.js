/**
 * @class EventName
 * @classdesc
 * Utility class providing standardized event naming helpers.
 *
 * Event names follow the structure:
 * `<eventClass>:<eventAction>:<subjectPart1>:<subjectPart2>:...:<subjectPartN>`
 *
 * Example:
 * `candle:opened:binance:btcusdc`
 */
class EventName {
    /** @enum {string} */
    static CLASS = Object.freeze({
        TRADE: 'trade',
        CANDLE: 'candle',
        ORDER: 'order',
        SIGNAL: 'signal'
    })

    /** @enum {string} */
    static ACTION = Object.freeze({
        PROCESSING_STARTED: 'processing_started',
        PROCESSING_COMPLETED: 'processing_completed',
        OPENED: 'opened',
        CLOSED: 'closed',
        UPDATED: 'updated',
        CANCELED: 'canceled',
        EXECUTED: 'executed',
        TRIGGERED: 'triggered'
    })

    /**
     * Builds a full event name using the structure:
     * `<eventClass>:<eventAction>:<subjectPart1>:<subjectPart2>:...:<subjectPartN>`
     *
     * @param {string} eventClass - One of {@link EventName.CLASS}
     * @param {string} eventAction - One of {@link EventName.ACTION}
     * @param {...string} subjectParts - Components describing the subject (e.g. exchange, symbol, etc.)
     * @returns {string} - Fully qualified event name
     *
     * @example
     * EventName.of(EventName.CLASS.CANDLE, EventName.ACTION.OPENED, 'binance', 'btcusdc')
     * // → "candle:opened:binance:btcusdc"
     */
    static of (eventClass, eventAction, ...subjectParts) {
        return [eventClass, eventAction, ...subjectParts].join(':')
    }

    /**
     * Builds an event name for the TRADE class.
     * @param {string} eventAction - One of {@link EventName.ACTION}
     * @param {...string} subjectParts - Components describing the subject
     * @returns {string} - Fully qualified event name
     *
     * @example
     * EventName.ofTrade(EventName.ACTION.UPDATED, 'binance', 'btcusdt')
     * // → "trade:updated:binance:btcusdt"
     */
    static ofTrade (eventAction, ...subjectParts) {
        return EventName.of(EventName.CLASS.TRADE, eventAction, ...subjectParts)
    }

    /**
     * Builds an event name for the CANDLE class.
     * @param {string} eventAction - One of {@link EventName.ACTION}
     * @param {...string} subjectParts - Components describing the subject
     * @returns {string} - Fully qualified event name
     *
     * @example
     * EventName.ofCandle(EventName.ACTION.OPENED, 'binance', 'btcusdc')
     * // → "candle:opened:binance:btcusdc"
     */
    static ofCandle (eventAction, ...subjectParts) {
        return EventName.of(EventName.CLASS.CANDLE, eventAction, ...subjectParts)
    }

    /**
     * Builds an event name for the ORDER class.
     * @param {string} eventAction - One of {@link EventName.ACTION}
     * @param {...string} subjectParts - Components describing the subject
     * @returns {string} - Fully qualified event name
     *
     * @example
     * EventName.ofOrder(EventName.ACTION.CLOSED, 'kraken', 'ethusd')
     * // → "order:closed:kraken:ethusd"
     */
    static ofOrder (eventAction, ...subjectParts) {
        return EventName.of(EventName.CLASS.ORDER, eventAction, ...subjectParts)
    }

    /**
     * Builds an event name for the SIGNAL class.
     * @param {string} signalName - Name of the signal/strategy
     * @param {string} exchangeName - Name of the exchange
     * @param {string} symbolId - Identifier of the trading symbol
     * @param {...string} subjectParts - Additional subject components
     * @returns {string} - Fully qualified event name
     *
     * @example
     * EventName.ofSignal('sLine', 'binance', 'btcusdc')
     * // → "signal:triggered:sLine:binance:btcusdc"
     */
    static ofSignal (signalName, exchangeName, symbolId, ...subjectParts) {
        return EventName.of(EventName.CLASS.SIGNAL, EventName.ACTION.TRIGGERED, signalName, exchangeName, symbolId, ...subjectParts)
    }
}

module.exports = EventName
