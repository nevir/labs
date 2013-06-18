/*
 * Copyright 2013 The Polymer Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */
(function(scope) {

  var PUBLISH = 'publish';
  var ATTRIBUTES = 'attributes';
  var PUBLISHED = '__published';
  var INSTANCE_ATTRIBUTES = '__instance_attributes';

  // instance api for attributes

  var attributes = {
     copyInstanceAttributes: function () {
      var a$ = this[INSTANCE_ATTRIBUTES];
      Object.keys(a$).forEach(function(name) {
        this.setAttribute(name, a$[name]);
      }, this);
    },
    // for each attribute on this, deserialize value to property as needed
    takeAttributes: function() {
      this.attributes.forEach(function(a) {
        this.attributeToProperty(a.name, a.value);
      }, this);
    },
    // if attribute 'name' is mapped to a property, deserialize
    // 'value' into that property
    attributeToProperty: function(name, value) {
      // try to match this attribute to a property (attributes are
      // all lower-case, so this is case-insensitive search)
      var name = this.propertyForAttribute(name);
      if (name) {
        // filter out 'mustached' values, these are to be
        // replaced with bound-data and are not yet values
        // themselves
        if (value.search(scope.bindPattern) >= 0) {
          return;
        }
        // get original value
        var defaultValue = this[name];
        // deserialize Boolean or Number values from attribute
        var value = this.deserializeValue(value, defaultValue);
        // only act if the value has changed
        if (value !== defaultValue) {
          // install new value (has side-effects)
          this[name] = value;
        }
      }
    },
    // return the published property matching name, or undefined
    propertyForAttribute: function(name) {
      // matchable properties must be published
      var properties = Object.keys(this[PUBLISHED]);
      // search for a matchable property
      return properties[properties.map(lowerCase).indexOf(name.toLowerCase())];
    },
    // convert representation of 'stringValue' based on type of 'defaultValue'
    deserializeValue: function(stringValue, defaultValue) {
      return scope.deserializeValue(stringValue, defaultValue);
    }
  };

  var lowerCase = String.prototype.toLowerCase.call.bind(
      String.prototype.toLowerCase);

  // polymer-element attributes feature
  
  var attributes_feature = {
    inheritPublished: function() {
      this.inheritObject(PUBLISHED);
    },
    parseAttributes: function() {
      this.publishAttributes(this.prototype);
      this.accumulateInstanceAttributes();
    },
    publishAttributes: function(prototype) {
      // our suffix prototype chain
      var inherited = prototype.__proto__;
      // inherit published properties
      var published = Object.create(inherited[PUBLISHED] || null);
      // merge attribute names from 'attributes' attribute
      var attributes = this.getAttribute(ATTRIBUTES);
      if (attributes) {
        // attributes='a b c' or attributes='a,b,c'
        var names = attributes.split(attributes.indexOf(',') >= 0 ? ',' : ' ');
        // record each name for publishing
        names.forEach(function(p) {
          p = p.trim();
          if (p && !(p in published)) {
            published[p] = null;
          }
        });
      }
      // install 'attributes' as properties on the prototype, 
      // but don't override
      Object.keys(published).forEach(function(p) {
        if (!(p in prototype) && !(p in inherited)) {
          prototype[p] = published[p];
        }
      });
      // store list of published properties on prototype
      prototype[PUBLISHED] = published
    },
    publish: function() {
      this.publishPublish(this.prototype);
    },
    publishPublish: function(prototype) {
      // acquire properties published imperatively
      var imperative = prototype[PUBLISH];
      if (imperative) {
        // install imperative properties, overriding defaults
        Object.keys(imperative).forEach(function(p) {
          prototype[p] = imperative[p];
        });
        // combine with other published properties
        Platform.mixin(
          prototype[PUBLISHED],
          imperative
        );
      }
    },
    // record clonable attributes from <element>
    accumulateInstanceAttributes: function() {
      // our suffix prototype chain
      var inherited = this.prototype.__proto__;
      // inherit instance attributes
      var clonable = Object.create(inherited[INSTANCE_ATTRIBUTES] || null);
      // merge attributes from element
      this.attributes.forEach(function(a) {
        if (this.isInstanceAttribute(a.name)) {
          clonable[a.name] = a.value;
        }
      }, this);
      /*
      a$ = this.attributes;
      for (var i=0, l=a$.length, a; (i<l) && (a=a$[i]); i++) {
        if (this.isInstanceAttribute(a.name)) {
          clonable[a.name] = a.value;
        }
      }
      */
      this.prototype[INSTANCE_ATTRIBUTES] = clonable;
    },
    isInstanceAttribute: function(name) {
      return !this.blackList[name] && name.slice(0,3) !== 'on-';
    },
    blackList: {name: 1, 'extends': 1, constructor: 1}
  };

  // add ATTRIBUTES symbol to blacklist
  attributes_feature.blackList[ATTRIBUTES] = 1;

  // exports

  scope.api.attributes = attributes;
  scope.features.attributes = attributes_feature;
  
})(Polymer);
