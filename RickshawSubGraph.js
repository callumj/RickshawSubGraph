/*
 * Sub graph provides a way to select an area of an existing Rickshaw graph
 * for which it renders a second graph on top (allowing quick backing out)
 * Constructor options:
 *  graph: Rickshaw object (Required)
 *  selector: Location for where the graph should be stored (defaults to #metrics .selection_chart)
 *  buttonSelector: Location for where the 'close sub graph' buttom/element (defaults to #metrics .remove_scope)
 */

define(function () {

  //constructor
  var RickshawSubGraph = function (opt) {
    if (typeof (opt.graph) == 'undefined')
      throw "graph must be defined"
    this.options = $.extend(true, { selector: "#metrics .selection_chart", buttonSelector: "#metrics .remove_scope" }, opt);
    this.graph = this.options.graph;
    this.init();
  };

  RickshawSubGraph.prototype.init = function () {
    this.attachInGraphSlider();
    this.bindToButton();
    this.bindToGraphUpdates();
    // cache the selector
    this.elementjQ = $(this.graph.element);
  };

  RickshawSubGraph.prototype.bindToButton = function () {
    var thisRef = this;
    $(this.options.buttonSelector).on("click", function () {
      thisRef.hideSelectionGraph();
    });
  }

  RickshawSubGraph.prototype.bindToGraphUpdates = function () {
    var thisRef = this;
    this.graph.onUpdate(function () {
      var wrapped = thisRef.handleGraphUpdate.bind(thisRef);
      wrapped();
    });
  };

  RickshawSubGraph.prototype.attachInGraphSlider = function () {
    var thisRef = this;

    thisRef.mouseData = { mouseDown: false };

    this.graph.element.addEventListener(
			'mousedown',
			function (event) {
			  thisRef.mouseData.mouseDown = true;
			}.bind(thisRef),
			false
		);

    this.graph.element.addEventListener(
      'mousemove',
      function (event) {
        if (thisRef.mouseData.mouseDown)
          thisRef.mouseMoved(event);
      }.bind(thisRef),
      false
    );

    this.graph.element.addEventListener(
      'mouseup',
      function (event) {
        thisRef.mouseData.mouseDown = false;
        thisRef.mouseReleased(event);
      }.bind(thisRef),
      false
    );
  };

  RickshawSubGraph.prototype.handleGraphUpdate = function (event) {
    if (this.selectionGraph)
    {
      this.mapData(this.selectionGraph.series);
      this.selectionGraph.update();
    }

    return true;
  };

  RickshawSubGraph.prototype.mouseMoved = function (event) {
    if (!this.mouseData.mouseDown)
      return;
    
    var pointX = event.pageX - this.elementjQ.offset().left;

    if (this.mouseData.startX == null)
      this.mouseData.startX = pointX;

    if (this.mouseData.startX == null)
      this.mouseData.startX = pointX;

    if (this.mouseData.box == null) {
      this.mouseData.box = this.graph.vis.append("rect")
                                  .attr("x", this.mouseData.startX)
                                  .attr("y", 0)
                                  .attr("width", 0)
                                  .attr("height", this.graph.vis.attr("height"))
                                  .style('opacity', 0.4);
    }

    var diff = pointX - this.mouseData.startX;
    if (diff < 0) {
      // backwards!
      this.mouseData.box.attr("x", pointX).attr("width", Math.abs(diff));
    }
    else
      this.mouseData.box.attr("width", diff);
  };

  RickshawSubGraph.prototype.mouseReleased = function (event) {
    this.mouseData.box.remove();

    var startX = this.mouseData.startX;
    var endX = event.pageX - this.elementjQ.offset().left;

    this.mouseData = { mouseDown: false };

    var xMin;
    var xMax;
    if (startX < endX) {
      xMin = startX;
      xMax = endX;
    }
    else {
      xMin = endX;
      xMax = startX;
    }

    this.showSelection(xMin, xMax);
  };

  RickshawSubGraph.prototype.hideSelectionGraph = function () {
    $(this.options.selector).html("");
    this.selectionGraph = undefined;
    this.elementjQ.show();
    $(this.options.buttonSelector).hide();
  }

  RickshawSubGraph.prototype.showSelection = function (startX, endX) {
    var starting = this.pointsForCoord(startX, 0);
    var ending = this.pointsForCoord(endX, 0);

    if (starting.nearestPoint != null && ending.nearestPoint != null) {
      // load up a secondary graph

      this.startingX = starting.nearestPoint.value.x;
      this.endingX = ending.nearestPoint.value.x;

      var scoped = [];
      this.mapData(scoped);

      this.selectionGraph = new Rickshaw.Graph({
        element: document.querySelector(this.options.selector),
        width: 800,
        height: 600,
        renderer: 'multi',
        series: scoped
      });

      var x_axis = new Rickshaw.Graph.Axis.Time({ graph: this.selectionGraph });

      new Rickshaw.Graph.HoverDetail({
        graph: this.selectionGraph
      });

      this.elementjQ.hide();
      this.selectionGraph.render();

      $(this.options.buttonSelector).show();
    }
  };

  RickshawSubGraph.prototype.mapData = function (scoped) {
    var thisRef = this;
    _.each(this.graph.series, function (set, total) {
      var reduced = [];
      _.each(set.data, function (point, total) {
        if (point.x >= thisRef.startingX && point.x <= thisRef.endingX)
          reduced.push(point);
      });
      var serie = {
        data: reduced,
        color: set.color,
        disabled: set.disabled,
        name: set.name,
        renderer: set.renderer
      }
      
      // add or update
      var existing = null;
      _.each(scoped, function (item, index, total) {
        if (item.name == set.name)
          existing = item;
      });

      if (existing != null)
      {
        existing.data = serie.data;
        existing.disabled = serie.disabled;
      }
      else
      {
        scoped.push(serie);
      }
    });
  };

  // stolen from Rickshaw's Hover legend
  RickshawSubGraph.prototype.pointsForCoord = function (x, y) {
    var graph = this.graph;
    var j = 0;
    var points = [];
    var nearestPoint;

    this.graph.series.active().forEach(function (series) {

      var data = graph.stackedData[j++];

      if (!data.length)
        return;

      var domainX = graph.x.invert(x);

      var domainIndexScale = d3.scale.linear()
				.domain([data[0].x, data.slice(-1)[0].x])
				.range([0, data.length - 1]);

      var approximateIndex = Math.round(domainIndexScale(domainX));
      if (approximateIndex == data.length - 1) approximateIndex--;

      var dataIndex = Math.min(approximateIndex || 0, data.length - 1);

      for (var i = approximateIndex; i < data.length - 1;) {

        if (!data[i] || !data[i + 1]) break;

        if (data[i].x <= domainX && data[i + 1].x > domainX) {
          dataIndex = Math.abs(domainX - data[i].x) < Math.abs(domainX - data[i + 1].x) ? i : i + 1;
          break;
        }

        if (data[i + 1].x <= domainX) { i++ } else { i-- }
      }

      if (dataIndex < 0) dataIndex = 0;
      var value = data[dataIndex];

      var distance = Math.sqrt(
				Math.pow(Math.abs(graph.x(value.x) - x), 2) +
				Math.pow(Math.abs(graph.y(value.y + value.y0) - y), 2)
			);

      var point = {
        series: series,
        value: value,
        distance: distance,
        order: j,
        name: series.name
      };

      if (!nearestPoint || distance < nearestPoint.distance) {
        nearestPoint = point;
      }

      points.push(point);

    }, this);

    if (!nearestPoint)
      return;

    return {
      nearestPoint: nearestPoint,
      points: points
    };
  };

  return RickshawSubGraph;
});
