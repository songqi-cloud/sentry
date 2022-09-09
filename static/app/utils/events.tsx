import {
  BaseGroup,
  EventMetadata,
  EventOrGroupType,
  GroupTombstone,
  TreeLabelPart,
} from 'sentry/types';
import {Event} from 'sentry/types/event';
import {isMobilePlatform, isNativePlatform} from 'sentry/utils/platform';

function isTombstone(maybe: BaseGroup | Event | GroupTombstone): maybe is GroupTombstone {
  return !maybe.hasOwnProperty('type');
}

/**
 * Extract the display message from an event.
 */
export function getMessage(
  event: Event | BaseGroup | GroupTombstone
): string | undefined {
  if (isTombstone(event)) {
    return event.culprit || '';
  }

  const {metadata, type, culprit} = event;

  switch (type) {
    case EventOrGroupType.ERROR:
    case EventOrGroupType.TRANSACTION:
      return metadata.value;
    case EventOrGroupType.CSP:
      return metadata.message;
    case EventOrGroupType.EXPECTCT:
    case EventOrGroupType.EXPECTSTAPLE:
    case EventOrGroupType.HPKP:
      return '';
    default:
      return culprit || '';
  }
}

/**
 * Get the location from an event.
 */
export function getLocation(event: Event | BaseGroup | GroupTombstone) {
  if (isTombstone(event)) {
    return undefined;
  }

  if (event.type === EventOrGroupType.ERROR && isNativePlatform(event.platform)) {
    return event.metadata.filename || undefined;
  }

  return undefined;
}

export function getTreeLabelPartDetails(part: TreeLabelPart) {
  // Note: This function also exists in Python in eventtypes/base.py, to make
  // porting efforts simpler it's recommended to keep both variants
  // structurally similar.
  if (typeof part === 'string') {
    return part;
  }

  const label = part?.function || part?.package || part?.filebase || part?.type;
  const classbase = part?.classbase;

  if (classbase) {
    return label ? `${classbase}.${label}` : classbase;
  }

  return label || '<unknown>';
}

function computeTitleWithTreeLabel(metadata: EventMetadata) {
  const {type, current_tree_label, finest_tree_label} = metadata;

  const treeLabel = current_tree_label || finest_tree_label;

  const formattedTreeLabel = treeLabel
    ? treeLabel.map(labelPart => getTreeLabelPartDetails(labelPart)).join(' | ')
    : undefined;

  if (!type) {
    return {
      title: formattedTreeLabel || metadata.function || '<unknown>',
      treeLabel,
    };
  }

  if (!formattedTreeLabel) {
    return {title: type, treeLabel: undefined};
  }

  return {
    title: `${type} | ${formattedTreeLabel}`,
    treeLabel: [{type}, ...(treeLabel ?? [])],
  };
}

export function getTitle(
  event: Event | BaseGroup,
  features: string[] = [],
  grouping = false
) {
  const {metadata, type, culprit, title} = event;

  const customTitle =
    features.includes('custom-event-title') && metadata?.title
      ? metadata.title
      : undefined;

  switch (type) {
    case EventOrGroupType.ERROR: {
      if (customTitle) {
        return {
          title: customTitle,
          subtitle: culprit,
          treeLabel: undefined,
        };
      }

      const displayTitleWithTreeLabel =
        features.includes('grouping-title-ui') &&
        (grouping ||
          isNativePlatform(event.platform) ||
          isMobilePlatform(event.platform));

      if (displayTitleWithTreeLabel) {
        return {
          subtitle: culprit,
          ...computeTitleWithTreeLabel(metadata),
        };
      }

      return {
        subtitle: culprit,
        title: metadata.type || metadata.function || '<unknown>',
        treeLabel: undefined,
      };
    }
    case EventOrGroupType.CSP:
      return {
        title: customTitle ?? metadata.directive ?? '',
        subtitle: metadata.uri ?? '',
        treeLabel: undefined,
      };
    case EventOrGroupType.EXPECTCT:
    case EventOrGroupType.EXPECTSTAPLE:
    case EventOrGroupType.HPKP:
      // Due to a regression some reports did not have message persisted
      // (https://github.com/getsentry/sentry/pull/19794) so we need to fall
      // back to the computed title for these.
      return {
        title: customTitle ?? (metadata.message || title),
        subtitle: metadata.origin ?? '',
        treeLabel: undefined,
      };
    case EventOrGroupType.DEFAULT:
      return {
        title: customTitle ?? metadata.title ?? '',
        subtitle: '',
        treeLabel: undefined,
      };
    case EventOrGroupType.TRANSACTION:
      return {
        title: customTitle ?? title,
        subtitle: event.issueCategory === 'performance' ? culprit : '',
        treeLabel: undefined,
      };
    default:
      return {
        title: customTitle ?? title,
        subtitle: '',
        treeLabel: undefined,
      };
  }
}

/**
 * Returns a short eventId with only 8 characters
 */
export function getShortEventId(eventId: string) {
  return eventId.substring(0, 8);
}
