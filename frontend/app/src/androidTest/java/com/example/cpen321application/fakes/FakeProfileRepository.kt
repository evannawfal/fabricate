package com.example.cpen321application.fakes

import com.example.cpen321application.data.Profile
import com.example.cpen321application.data.ProfileRepository

class FakeProfileRepository(var profile: Profile = Profile("me", "Sam Lee", "sam@example.com", "")) : ProfileRepository {
    override suspend fun getProfile() = profile

    override suspend fun updatePronouns(pronouns: String) = profile.copy(pronouns = pronouns).also { profile = it }
}
