export type UserRole = 'user' | 'admin'
export type AccountStatus = 'active' | 'banned'
export type RegistrationStatus = 'pending' | 'accepted' | 'rejected'

export interface Profile {
  id: string
  email: string
  nickname: string
  role: UserRole
  status: AccountStatus
  is_owner?: boolean
  created_at: string
  updated_at: string
}

export interface Registration {
  id: string
  user_id: string
  full_name: string
  gender: string
  age: number | null
  education: string
  phone: string
  applicant_email: string
  identity_type: string
  organization: string
  participation_mode: '个人参赛' | '寻找队友'
  team_name: string
  skills: string[]
  track: string
  bio: string
  motivation: string
  parent_name?: string | null
  parent_phone?: string | null
  rules_agreed: boolean
  guardian_agreed: boolean
  github_url?: string | null
  portfolio_url: string
  status: RegistrationStatus
  rejection_reason?: string | null
  check_in_token?: string | null
  checkin_session_id?: string | null
  checked_in_at?: string | null
  checked_in_by?: string | null
  created_at: string
  submitted_at: string
  updated_at: string
  profiles?: Pick<Profile, 'email' | 'nickname'>
}

export interface SystemConfig {
  id?: number
  auth_hero_image_url?: string
  smtp_host: string
  smtp_port: number
  from_email: string
  smtp_username: string
  smtp_password: string
  notification_template: string
  rules_content?: string
  privacy_content?: string
  verification_email_template?: string
  site_name?: string
  site_subtitle?: string
  site_icon_url?: string
  footer_content?: string
  home_hero_image_url?: string
  home_eyebrow?: string
  home_title?: string
  home_highlight?: string
  home_subtitle?: string
  home_cta_label?: string
  home_event_date?: string
  home_location?: string
  home_capacity?: string
  home_about_label?: string
  home_about_title?: string
  home_about_highlight?: string
  home_about_description?: string
  home_feature_1_title?: string
  home_feature_1_text?: string
  home_feature_2_title?: string
  home_feature_2_text?: string
  home_feature_3_title?: string
  home_feature_3_text?: string
  registration_open?: boolean
  dashboard_announcement?: string
  team_tagline?: string
  team_intro?: string
  team_principles?: string
}

export interface SiteAnnouncement {
  id: string
  title: string
  content: string
  is_pinned: boolean
  published: boolean
  created_at: string
  updated_at: string
  created_by?: string | null
}
