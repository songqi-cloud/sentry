import {mountWithTheme} from 'sentry-test/enzyme';
import {initializeOrg} from 'sentry-test/initializeOrg';

import {t} from 'sentry/locale';
import EventView from 'sentry/utils/discover/eventView';
import {DisplayModes} from 'sentry/utils/discover/types';
import {MetricsCardinalityProvider} from 'sentry/utils/performance/contexts/metricsCardinality';
import ResultsChart from 'sentry/views/eventsV2/resultsChart';

describe('EventsV2 > ResultsChart', function () {
  const features = ['discover-basic'];
  const location = TestStubs.location({
    query: {query: 'tag:value'},
    pathname: '/',
  });

  let organization, eventView, initialData;

  beforeEach(() => {
    organization = TestStubs.Organization({
      features,
      projects: [TestStubs.Project()],
    });
    initialData = initializeOrg({
      organization,
      router: {
        location,
      },
      project: 1,
      projects: [],
    });
    eventView = EventView.fromSavedQueryOrLocation(undefined, location);
  });

  it('only allows default, daily, previous period, and bar display modes when multiple y axis are selected', function () {
    const wrapper = mountWithTheme(
      <MetricsCardinalityProvider location={location} organization={organization}>
        <ResultsChart
          router={TestStubs.router()}
          organization={organization}
          eventView={eventView}
          location={location}
          onAxisChange={() => undefined}
          onDisplayChange={() => undefined}
          total={1}
          confirmedQuery
          yAxis={['count()', 'failure_count()']}
          onTopEventsChange={() => {}}
        />
      </MetricsCardinalityProvider>,
      initialData.routerContext
    );
    const displayOptions = wrapper.find('ChartFooter').props().displayOptions;
    displayOptions.forEach(({value, disabled}) => {
      if (
        ![
          DisplayModes.DEFAULT,
          DisplayModes.DAILY,
          DisplayModes.PREVIOUS,
          DisplayModes.BAR,
        ].includes(value)
      ) {
        expect(disabled).toBe(true);
      }
    });
  });

  it('does not display a chart if no y axis is selected', function () {
    const wrapper = mountWithTheme(
      <MetricsCardinalityProvider location={location} organization={organization}>
        <ResultsChart
          router={TestStubs.router()}
          organization={organization}
          eventView={eventView}
          location={location}
          onAxisChange={() => undefined}
          onDisplayChange={() => undefined}
          total={1}
          confirmedQuery
          yAxis={[]}
          onTopEventsChange={() => {}}
        />
      </MetricsCardinalityProvider>,
      initialData.routerContext
    );
    expect(wrapper.find('NoChartContainer').children().children().html()).toEqual(
      t('No Y-Axis selected.')
    );
  });

  it('disables equation y-axis options when in World Map display mode', function () {
    eventView.display = DisplayModes.WORLDMAP;
    eventView.fields = [
      {field: 'count()'},
      {field: 'count_unique(user)'},
      {field: 'equation|count() + 2'},
    ];
    const wrapper = mountWithTheme(
      <MetricsCardinalityProvider location={location} organization={organization}>
        <ResultsChart
          router={TestStubs.router()}
          organization={organization}
          eventView={eventView}
          location={location}
          onAxisChange={() => undefined}
          onDisplayChange={() => undefined}
          total={1}
          confirmedQuery
          yAxis={['count()']}
          onTopEventsChange={() => {}}
        />
      </MetricsCardinalityProvider>,
      initialData.routerContext
    );
    const yAxisOptions = wrapper.find('ChartFooter').props().yAxisOptions;
    expect(yAxisOptions.length).toEqual(2);
    expect(yAxisOptions[0].value).toEqual('count()');
    expect(yAxisOptions[1].value).toEqual('count_unique(user)');
  });
});
