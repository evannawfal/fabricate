package com.example.cpen321application.network

import com.example.cpen321application.BuildConfig
import com.example.cpen321application.data.Profile
import com.example.cpen321application.data.ProfileRepository
import org.json.JSONObject

/** The signed-in user's profile on the back-end (`/users/me`). */
class BackendProfileRepository(
    tokenProvider: suspend () -> String?,
    onUnauthorized: suspend () -> Unit = {},
    baseUrl: String = BuildConfig.API_BASE_URL,
) : ProfileRepository {
    private val api = JsonApi(tokenProvider, onUnauthorized, baseUrl)

    override suspend fun getProfile(): Profile = api.send("/users/me", parse = ::parseProfile)

    override suspend fun updatePronouns(pronouns: String): Profile =
        api.send("/users/me", JSONObject().put("pronouns", pronouns), "PATCH", ::parseProfile)
}

private fun parseProfile(json: JSONObject) = Profile(
    id = json.getString("id"),
    name = json.getString("name"),
    email = json.getString("email"),
    pronouns = json.getString("pronouns"),
)
