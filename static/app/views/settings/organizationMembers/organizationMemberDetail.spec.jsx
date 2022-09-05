import {mountWithTheme} from 'sentry-test/enzyme';
import {mountGlobalModal} from 'sentry-test/modal';

import {updateMember} from 'sentry/actionCreators/members';
import TeamStore from 'sentry/stores/teamStore';
import {OrganizationContext} from 'sentry/views/organizationContext';
import OrganizationMemberDetail from 'sentry/views/settings/organizationMembers/organizationMemberDetail';

jest.mock('sentry/actionCreators/members', () => ({
  updateMember: jest.fn().mockReturnValue(new Promise(() => {})),
}));

describe('OrganizationMemberDetail', () => {
  let organization;
  let wrapper;
  let routerContext;
  const team = TestStubs.Team();
  const teams = [
    team,
    TestStubs.Team({
      id: '2',
      slug: 'new-team',
      name: 'New Team',
      isMember: false,
    }),
  ];

  const teamAssignment = {
    teams: [team.slug],
    teamRoles: [
      {
        teamSlug: team.slug,
        role: null,
      },
    ],
  };

  const member = TestStubs.Member({
    dateCreated: new Date(),
    ...teamAssignment,
  });
  const pendingMember = TestStubs.Member({
    id: 2,
    dateCreated: new Date(),
    invite_link: 'http://example.com/i/abc123',
    pending: true,
    ...teamAssignment,
  });
  const expiredMember = TestStubs.Member({
    id: 3,
    dateCreated: new Date(),
    invite_link: 'http://example.com/i/abc123',
    pending: true,
    expired: true,
    ...teamAssignment,
  });

  beforeAll(() => {
    TeamStore.loadInitialData(teams);
  });

  describe('Can Edit', () => {
    beforeAll(() => {
      organization = TestStubs.Organization({teams, features: ['team-roles']});
      routerContext = TestStubs.routerContext([{organization}]);
    });

    beforeEach(() => {
      MockApiClient.clearMockResponses();
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${member.id}/`,
        body: member,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/teams/`,
        body: teams,
      });
    });

    it('changes org role to owner', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: member.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      // Should have 4 roles
      expect(wrapper.find('OrganizationRoleSelect Radio')).toHaveLength(4);

      wrapper.find('OrganizationRoleSelect Radio').last().simulate('click');

      expect(wrapper.find('OrganizationRoleSelect Radio').last().prop('checked')).toBe(
        true
      );

      // Save Member
      wrapper.find('Button[priority="primary"]').simulate('click');

      expect(updateMember).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({orgRole: 'owner'}),
        })
      );
    });

    it('leaves a team', async () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: member.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      // Wait for team list to load
      await tick();

      // Remove our one team
      const button = wrapper.find('TeamSelect TeamRow Button');
      expect(button).toHaveLength(1);
      button.simulate('click');

      // Save Member
      wrapper.find('Button[priority="primary"]').simulate('click');

      expect(updateMember).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({teamRoles: []}),
        })
      );
    });

    it('joins a team and assign a team-role', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: member.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      // Wait for team list to fetch.
      wrapper.update();

      // Should have one team enabled
      expect(wrapper.find('TeamRolesPanelItem')).toHaveLength(1);

      // Select new team to join
      // Open the dropdown
      wrapper.find('TeamSelect DropdownButton').simulate('click');

      // Click the first item
      wrapper.find('TeamSelect [title="new team"]').at(0).simulate('click');

      // Assign as admin to new team
      const teamRoleSelect = wrapper.find('RoleSelectControl').at(0);
      teamRoleSelect.props().onChange({value: 'admin'});

      // Save Member
      wrapper.find('Button[priority="primary"]').simulate('click');

      expect(updateMember).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            teamRoles: [
              {role: null, teamSlug: 'team-slug'},
              {role: 'admin', teamSlug: 'new-team'},
            ],
          }),
        })
      );
    });
  });

  describe('Cannot Edit', () => {
    beforeAll(() => {
      organization = TestStubs.Organization({
        teams,
        access: ['org:read'],
        features: ['team-roles'],
      });
      routerContext = TestStubs.routerContext([{organization}]);
    });

    beforeEach(() => {
      MockApiClient.clearMockResponses();
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${member.id}/`,
        body: member,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/teams/`,
        body: teams,
      });
    });

    it('can not change roles, teams, or save', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: member.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      wrapper.update();

      // Should have 4 roles
      expect(wrapper.find('OrganizationRoleSelect').prop('disabled')).toBe(true);
      expect(wrapper.find('TeamSelect').prop('disabled')).toBe(true);
      expect(wrapper.find('TeamRow Button').first().prop('disabled')).toBe(true);

      // Should not be able to edit team-roles
      expect(wrapper.find('RoleSelectControl').first().prop('disabled')).toBe(true);

      // Save Member
      expect(wrapper.find('Button[priority="primary"]').prop('disabled')).toBe(true);
    });
  });

  describe('Display status', () => {
    beforeAll(() => {
      organization = TestStubs.Organization({teams, access: ['org:read']});
      routerContext = TestStubs.routerContext([{organization}]);
    });

    beforeEach(() => {
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${pendingMember.id}/`,
        body: pendingMember,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${expiredMember.id}/`,
        body: expiredMember,
      });
    });

    it('display pending status', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: pendingMember.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      expect(wrapper.find('[data-test-id="member-status"]').text()).toEqual(
        'Invitation Pending'
      );
    });

    it('display expired status', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: expiredMember.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      expect(wrapper.find('[data-test-id="member-status"]').text()).toEqual(
        'Invitation Expired'
      );
    });
  });

  describe('Show resend button', () => {
    beforeAll(() => {
      organization = TestStubs.Organization({teams, access: ['org:read']});
      routerContext = TestStubs.routerContext([{organization}]);
    });

    beforeEach(() => {
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${pendingMember.id}/`,
        body: pendingMember,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${expiredMember.id}/`,
        body: expiredMember,
      });
    });

    it('shows for pending', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: pendingMember.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      const button = wrapper.find('Button[data-test-id="resend-invite"]');
      expect(button.text()).toEqual('Resend Invite');
    });

    it('does not show for expired', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: expiredMember.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      expect(wrapper.find('Button[data-test-id="resend-invite"]')).toHaveLength(0);
    });
  });

  describe('Reset member 2FA', () => {
    const fields = {
      roles: TestStubs.OrgRoleList(),
      dateCreated: new Date(),
      ...teamAssignment,
    };

    const noAccess = TestStubs.Member({
      ...fields,
      id: '4',
      user: TestStubs.User({has2fa: false}),
    });

    const no2fa = TestStubs.Member({
      ...fields,
      id: '5',
      user: TestStubs.User({has2fa: false, authenticators: [], canReset2fa: true}),
    });

    const has2fa = TestStubs.Member({
      ...fields,
      id: '6',
      user: TestStubs.User({
        has2fa: true,
        authenticators: [
          TestStubs.Authenticators().Totp(),
          TestStubs.Authenticators().Sms(),
          TestStubs.Authenticators().U2f(),
        ],
        canReset2fa: true,
      }),
    });

    const multipleOrgs = TestStubs.Member({
      ...fields,
      id: '7',
      user: TestStubs.User({
        has2fa: true,
        authenticators: [TestStubs.Authenticators().Totp()],
        canReset2fa: false,
      }),
    });

    beforeAll(() => {
      organization = TestStubs.Organization({teams});
      routerContext = TestStubs.routerContext([{organization}]);
    });

    beforeEach(() => {
      MockApiClient.clearMockResponses();
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${pendingMember.id}/`,
        body: pendingMember,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${noAccess.id}/`,
        body: noAccess,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${no2fa.id}/`,
        body: no2fa,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${has2fa.id}/`,
        body: has2fa,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${multipleOrgs.id}/`,
        body: multipleOrgs,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/teams/`,
        body: teams,
      });
    });

    const button = 'Button[data-test-id="reset-2fa"]';
    const tooltip = 'Tooltip[data-test-id="reset-2fa-tooltip"]';

    const expectButtonEnabled = () => {
      expect(wrapper.find(button).text()).toEqual('Reset two-factor authentication');
      expect(wrapper.find(button).prop('disabled')).toBe(false);

      expect(wrapper.find(tooltip).prop('title')).toEqual('');
      expect(wrapper.find(tooltip).prop('disabled')).toBe(true);
    };

    const expectButtonDisabled = title => {
      expect(wrapper.find(button).text()).toEqual('Reset two-factor authentication');
      expect(wrapper.find(button).prop('disabled')).toBe(true);

      expect(wrapper.find(tooltip).prop('title')).toEqual(title);
      expect(wrapper.find(tooltip).prop('disabled')).toBe(false);
    };

    it('does not show for pending member', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: pendingMember.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      expect(wrapper.find(button)).toHaveLength(0);
    });

    it('shows tooltip for joined member without permission to edit', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: noAccess.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      expectButtonDisabled('You do not have permission to perform this action');
    });

    it('shows tooltip for member without 2fa', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: no2fa.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      expectButtonDisabled('Not enrolled in two-factor authentication');
    });

    it('can reset member 2FA', async () => {
      const deleteMocks = has2fa.user.authenticators.map(auth =>
        MockApiClient.addMockResponse({
          url: `/users/${has2fa.user.id}/authenticators/${auth.id}/`,
          method: 'DELETE',
        })
      );

      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: has2fa.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );

      expectButtonEnabled();
      wrapper.find(button).simulate('click');

      const modal = await mountGlobalModal();
      modal.find('Button[data-test-id="confirm-button"]').simulate('click');

      deleteMocks.forEach(deleteMock => {
        expect(deleteMock).toHaveBeenCalled();
      });
    });

    it('shows tooltip for member in multiple orgs', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: multipleOrgs.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      expectButtonDisabled('Cannot be reset since user is in more than one organization');
    });

    it('shows tooltip for member in 2FA required org', () => {
      organization.require2FA = true;
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${has2fa.id}/`,
        body: has2fa,
      });

      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: has2fa.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      expectButtonDisabled(
        'Cannot be reset since two-factor is required for this organization'
      );
    });
  });

  describe('Org Roles affect Team Roles', () => {
    // Org Admin will be deprecated
    const admin = TestStubs.Member({
      id: '4',
      role: 'admin',
      roleName: 'Admin',
      orgRole: 'admin',
      ...teamAssignment,
    });
    const manager = TestStubs.Member({
      id: '5',
      role: 'manager',
      roleName: 'Manager',
      orgRole: 'manager',
      ...teamAssignment,
    });
    const owner = TestStubs.Member({
      id: '6',
      role: 'owner',
      roleName: 'Owner',
      orgRole: 'owner',
      ...teamAssignment,
    });

    beforeAll(() => {
      organization = TestStubs.Organization({teams, features: ['team-roles']});
      routerContext = TestStubs.routerContext([{organization}]);
    });

    beforeEach(() => {
      MockApiClient.clearMockResponses();
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${member.id}/`,
        body: member,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${admin.id}/`,
        body: admin,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${manager.id}/`,
        body: manager,
      });
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/members/${owner.id}/`,
        body: owner,
      });
    });

    it('does not overwrite team-roles for org members', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: member.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      wrapper.update();

      expect(wrapper.find('RoleOverwritePanelAlert PanelAlert')).toHaveLength(0);

      const teamRoleSelect = wrapper.find('RoleSelectControl').first();
      expect(teamRoleSelect.prop('disabled')).toBe(false);
      expect(teamRoleSelect.prop('value')).toBe('contributor');
    });

    it('overwrite team-roles for org admin/manager/owner', () => {
      function testForOrgRole(testMember) {
        wrapper = mountWithTheme(
          <OrganizationContext.Provider value={organization}>
            <OrganizationMemberDetail params={{memberId: testMember.id}} />
          </OrganizationContext.Provider>,
          routerContext
        );
        wrapper.update();

        expect(wrapper.find('RoleOverwritePanelAlert PanelAlert')).toHaveLength(1);

        const teamRoleSelect = wrapper.find('RoleSelectControl').first();
        expect(teamRoleSelect.prop('disabled')).toBe(true);
        expect(teamRoleSelect.prop('value')).toBe('admin');
      }

      [admin, manager, owner].forEach(testForOrgRole);
    });

    it('overwrites when changing from member to manager', () => {
      wrapper = mountWithTheme(
        <OrganizationContext.Provider value={organization}>
          <OrganizationMemberDetail params={{memberId: member.id}} />
        </OrganizationContext.Provider>,
        routerContext
      );
      wrapper.update();

      // Team-role can be edited
      expect(wrapper.find('RoleOverwritePanelAlert PanelAlert')).toHaveLength(0);
      expect(wrapper.find('RoleSelectControl').first().prop('disabled')).toBe(false);

      // Set org-role to owner
      wrapper.find('OrganizationRoleSelect Radio').last().simulate('click');
      expect(wrapper.find('OrganizationRoleSelect Radio').last().prop('checked')).toBe(
        true
      );

      // Team-role cannot be edited due to pending org-role
      expect(wrapper.find('RoleOverwritePanelAlert PanelAlert')).toHaveLength(1);
      expect(wrapper.find('RoleSelectControl').first().prop('disabled')).toBe(true);
    });
  });
});
