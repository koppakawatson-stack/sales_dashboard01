/**
 * HARVIK TECHNOLOGIES — Domain Event Bus
 * Dispatches domain events for asynchronous, decoupled system processing.
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.history = []; // in-memory recent event buffer for observability/debugging
    this.maxHistory = 100;
  }

  /**
   * Publish a structured domain event
   */
  publish(eventType, {
    entityType = 'Lead',
    entityId,
    actorId = 'SYSTEM',
    metadata = {},
  }) {
    const event = {
      eventId: uuidv4(),
      eventType,
      entityType,
      entityId: String(entityId),
      actorId: String(actorId),
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Store in recent history
    this.history.unshift(event);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    console.log(`📡 [DOMAIN_EVENT] ${eventType} entityId=${entityId} actor=${actorId} id=${event.eventId}`);

    // Emit event on bus
    this.emit(eventType, event);
    this.emit('*', event);

    return event;
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 20) {
    return this.history.slice(0, limit);
  }
}

const eventBus = new DomainEventBus();

module.exports = eventBus;
