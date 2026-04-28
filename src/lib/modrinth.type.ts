// place files you want to import through the `$lib` alias in this folder.
export interface IndexFile {
	formatVersion: number
	game: string
	versionId: string
	name: string
	files: Array<{
		path: string
		hashes: {
			sha1: string
			sha512: string
		}
		env: {
			client: string
			server: string
		}
		downloads: Array<string>
		fileSize: number
	}>
	dependencies: {
		"fabric-loader": string
		minecraft: string
	}
}

export type Project = {
	client_side: string
	server_side: string
	game_versions: Array<string>
	id: string
	slug: string
	project_type: string
	team: string
	organization: string | null
	title: string
	description: string
	body: string
	body_url?: any
	published: string
	updated: string
	approved: string
	queued: any
	status: string
	requested_status: any
	moderator_message: any
	license: {
		id: string
		name: string
		url: string | null
	}
	downloads: number
	followers: number
	categories: Array<string>
	additional_categories: Array<any>
	loaders: Array<string>
	versions: Array<string>
	icon_url: string
	issues_url: string | null
	source_url: string | null
	wiki_url: string | null
	discord_url: string | null
	donation_urls: Array<{
		id: string
		platform: string
		url: string
	}>
	gallery: Array<{
		url: string
		raw_url: string
		featured: boolean
		title: string
		description: string
		created: string
		ordering: number
	}>
	color: number
	thread_id: string
	monetization_status: string
}

export interface Version {
	game_versions: Array<string>
	loaders: Array<string>
	id: string
	project_id: string
	author_id: string
	featured: boolean
	name: string
	version_number: string
	changelog: string
	changelog_url?: string
	date_published: string
	downloads: number
	version_type: string
	status: string
	requested_status?: string
	files: Array<{
		id: string
		hashes: {
			sha1: string
			sha512: string
		}
		url: string
		filename: string
		primary: boolean
		size: number
		file_type?: string
	}>
	dependencies: Array<{
		version_id?: string
		project_id?: string
		file_name?: string
		dependency_type: string
	}>
}