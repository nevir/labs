/*
 * Copyright 2013 The Polymer Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

(function(scope) {

  // imports

  var log = window.logFlags || {};
  log.events = true;

  // magic words
  
  var EVENT_PREFIX = "on-";
  var DELEGATES = '__eventDelegates';

  // instance api for events

  var events = {
    // event listeners on the host element
    addHostListeners: function() {
      var events = this[DELEGATES];
      log.events && (Object.keys(events).length > 0) && console.log('[%s] addHostListeners:', this.localName, events);
      this.addNodeListeners(this, events, this.hostEventListener);
    },
    // event listeners in the shadow-root element
    addInstanceListeners: function(root) {
      var events = this.accumulateEvents(root);
      log.events && (Object.keys(events).length > 0) && console.log('[%s:root] addInstanceListeners:', this.localName, events);
      this.addNodeListeners(root, events, this.instanceEventListener);
    },
    // find event delegations: re-entrant function walks a tree
    // - process events on node
    // - process my children
    // - process content children for templates
    accumulateEvents: function(node, events) {
      events = events || {};
      this.accumulateNodeEvents(node, events);
      this.accumulateChildEvents(node, events);
      this.accumulateTemplatedEvents(node, events);
      return events;
    },
    accumulateNodeEvents: function(node, events) {
      if (node.attributes) {
        node.attributes.forEach(function(a) {
          if (hasEventPrefix(a.name)) {
            this.accumulateEvent(removeEventPrefix(a.name), events);
          }
        }, this);
      }
    },
    accumulateEvent: function(name, events) {
      events[event_translations[name] || name] = 1;
    },
    accumulateChildEvents: function(node, events) {
      node.childNodes.forEach(function(n) {
        this.accumulateEvents(n, events);
      }, this);
    },
    accumulateTemplatedEvents: function(node, events) {
      if (node.localName == 'template') {
        var content = getTemplateContent(node);
        if (content) {
          this.accumulateChildEvents(content, events);
        }
      }
    },
    addNodeListeners: function(node, events, listener) {
      var fn = listener.bind(this);
      Object.keys(events).forEach(function(n) {
        node.addEventListener(n, fn);
      });
    },
    instanceEventListener: function(event) {
      listenLocal(this, event);
    },  
    hostEventListener: function(event) {
      if (!event.cancelBubble) {
        log.events && console.group("[%s]: listenHost [%s]", this.localName, event.type);
        var h = this.findEventDelegate(event);
        if (h) {
          log.events && console.log('[%s] found host handler name [%s]', this.localName, h);
          this.dispatchMethod(this, h, [event, event.detail, this]);
        }
        log.events && console.groupEnd();
      }
    },
    // find the method name in delegates mapped to event.type
    findEventDelegate: function(event) {
      return this[DELEGATES][event.type];
    },
    // call 'methodName' method on 'node' with 'args', if the method exists
    dispatchMethod: function(node, methodName, args) {
      if (node) {
        log.events && console.group('[%s] dispatch [%s]', node.localName, methodName);
        var fn = this[methodName];
        if (fn) {
          fn[args ? 'apply' : 'call'](this, args);
        }
        log.events && console.groupEnd();
      }
    }
  };

  // TODO(sorvell): Currently in MDV, there is no way to get a template's
  // effective content. A template can have a ref property
  // that points to the template from which this one has been cloned.
  // Remove this when the MDV api is improved
  // (https://github.com/polymer-project/mdv/issues/15).
  function getTemplateContent(template) {
    return template.ref ? template.ref.content : template.content;
  }

  // TODO(sjmiles): much of the below privatized only because of the vague 
  // notion that the below is too fiddly and we need to revisit the core
  // feature

  function listenLocal(host, event) {
    if (!event.cancelBubble) {
      event.on = EVENT_PREFIX + event.type;
      log.events && console.group("[%s]: listenLocal [%s]", host.localName, event.on);
      if (!event.path || window.ShadowDOMPolyfill) {
        _listenLocalNoEventPath(host, event);
      } else {
        _listenLocal(host, event);
      }
      log.events && console.groupEnd();
    }
  }

  function _listenLocal(host, event) {
    var c = null;
    // use `some` to stop iterating after the first matching target
    Array.prototype.some.call(event.path, function(t) {
      // if we hit host, stop
      if (t === host) {
        return true;
      }
      // find a controller for target `t`, unless we already found `host` as a controller
      c = (c === host) ? c : findController(t);
      // if we have a controller, dispatch the event, return 'true' if handler returns true
      if (c && handleEvent(c, t, event)) {
        return true;
      }
    }, this);
  }
  
  // TODO(sorvell): remove when ShadowDOM polyfill supports event path.
  // Note that findController will not return the expected 
  // controller when when the event target is a distributed node.
  // This because we cannot traverse from a composed node to a node 
  // in shadowRoot.
  // This will be addressed via an event path api 
  // https://www.w3.org/Bugs/Public/show_bug.cgi?id=21066
  function _listenLocalNoEventPath(host, event) {
    log.events && console.log('event.path() not supported for', event.type);
    var t = event.target, c = null;
   // if we hit dirt or host, stop
    while (t && t != host) {
      // find a controller for target `t`, unless we already found `host` as a controller
      c = (c === host) ? c : findController(t);
      // if we have a controller, dispatch the event, return 'true' if handler returns true
      if (c && handleEvent(c, t, event)) {
        return true;
      }
      t = t.parentNode;
    }
  }

  function findController(node) {
    // find the shadow root with dispatching host that contains node
    while (node) {
      if (/*node.localName === 'shadow-root' &&*/ node.host && node.host.dispatchMethod) {
        return node.host
      }
      node = node.parentNode;
    }
  };

  function handleEvent(ctrlr, node, event) {
    var h = node.getAttribute && node.getAttribute(event.on);
    if (h && handleIfNotHandled(node, event)) {
      log.events && console.log('[%s] found handler name [%s]', ctrlr.localName, h);
      ctrlr.dispatchMethod(node, h, [event, event.detail, node]);
    }
    return event.cancelBubble;
  };
  
  function handleIfNotHandled(node, event) {
    var list = eventHandledTable.get(event);
    if (!list) {
      eventHandledTable.set(event, list = []);
    }
    if (list.indexOf(node) < 0) {
      list.push(node);
      return true;
    }
  }

  var eventHandledTable = new SideTable('handledList');

  // polymer-element event feature

  var events_feature = { 
    inheritDelegates: function() {
      this.inheritObject(DELEGATES);
    },
    parseHostEvents: function() {
      // our delegates map
      var delegates = this.prototype[DELEGATES];
      // extract data from attributes into delegates
      this.addAttributeDelegates(delegates);
    },
    addAttributeDelegates: function(delegates) {
      // for each attribute
      for (var i=0, a; a=this.attributes[i]; i++) {
        // does it have magic marker identifying it as an event delegate?
        if (hasEventPrefix(a.name)) {
          // if so, add the info to delegates
          delegates[removeEventPrefix(a.name)] = 1;
        }
      }
    },
    parseLocalEvents: function() {
      // our suffix prototype chain
      var inherited = this.prototype.__proto__;
      // extract data from templates into delegates
      var delegates = Object.create(inherited[DELEGATES] || null);
      this.querySelectorAll('template').forEach(function(t) {
        // acquire delegates from entire subtree at t
        this.accumulateTemplatedEvents(t);
      }, this);
      console.log('[%s]', this.attributes.name.value, delegates);
    },
    accumulateEvents: function(node, events) {
      events = events || {};
      this.accumulateNodeEvents(node, events);
      this.accumulateChildEvents(node, events);
      this.accumulateTemplatedEvents(node, events);
      return events;
    },
    accumulateNodeEvents: function(node, events) {
      if (node.attributes) {
        node.attributes.forEach(function(a) {
          if (hasEventPrefix(a.name)) {
            this.accumulateEvent(removeEventPrefix(a.name), events);
          }
        }, this);
      }
    },
    accumulateEvent: function(name, events) {
      events[event_translations[name] || name] = 1;
    },
    accumulateChildEvents: function(node, events) {
      node.childNodes.forEach(function(n) {
        this.accumulateEvents(n, events);
      }, this);
    },
    accumulateTemplatedEvents: function(node, events) {
      if (node.localName == 'template') {
        var content = getTemplateContent(node);
        if (content) {
          this.accumulateChildEvents(content, events);
        }
      }
    },
  };


  var event_translations = {
    webkitanimationstart: 'webkitAnimationStart',
    webkitanimationend: 'webkitAnimationEnd',
    webkittransitionend: 'webkitTransitionEnd',
    domfocusout: 'DOMFocusOut',
    domfocusin: 'DOMFocusIn'
  };

  function hasEventPrefix(n) {
    return n.slice(0, prefixLength) == EVENT_PREFIX;
  }

  function removeEventPrefix(n) {
    return n.slice(prefixLength);
  }

  var prefixLength = EVENT_PREFIX.length;
  
  // exports

  scope.api.events = events;
  scope.features.events = events_feature;
  scope.event_translations = event_translations;

})(Polymer);